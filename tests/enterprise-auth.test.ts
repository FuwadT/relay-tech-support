// Independent HTTP auth regressions against real SQLite. OIDC transport is an
// injected fixture here; cryptographic signature checks live in enterprise-oidc-client.test.ts.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { handleEnterpriseAuth, enterpriseLoginProviders, type EnterpriseAuthEnvironment } from '../lib/enterprise/auth';
import { createEnterpriseOidcClient, type OidcTransaction } from '../lib/enterprise/oidc-client';
import { sha256 } from '../lib/enterprise/http';
import { handleEnterpriseRequest } from '../enterprise/worker';

const origin = 'https://relay.example.invalid';
const tenant = '11111111-2222-4333-8444-555555555555';
const issuer = { google: 'https://accounts.google.com', entra: `https://login.microsoftonline.com/${tenant}/v2.0` };
const opaque = () => randomBytes(32).toString('base64url');
type Provider = keyof typeof issuer;
type Binding = string | number | null;
function cookie(response: Response, name: string) {
  const item = response.headers.getSetCookie().find(value => value.startsWith(name + '='));
  return item?.split(';')[0] ?? '';
}
function hardening(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}
async function fixture(t: TestContext) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  for (const migration of readdirSync('enterprise/migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sql.exec(readFileSync('enterprise/migrations/' + migration, 'utf8'));
  }
  const db = {
    prepare(query: string) {
      const wrap = (bindings: Binding[] = []): unknown => ({
        bind: (...values: Binding[]) => wrap(values),
        first: async () => sql.prepare(query).get(...bindings) ?? null,
        all: async () => ({ success: true, results: sql.prepare(query).all(...bindings), meta: {} }),
        run: async () => { const result = sql.prepare(query).run(...bindings); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
        query, bindings,
      });
      return wrap();
    },
    async batch(statements: { query: string; bindings: Binding[] }[]) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => ({ success: true, results: sql.prepare(statement.query).all(...statement.bindings), meta: {} }));
        sql.exec('COMMIT');
        return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as EnterpriseAuthEnvironment['ENTERPRISE_DB'];
  const env: EnterpriseAuthEnvironment = {
    ENTERPRISE_DB: db, APP_ORIGIN: origin, ENTERPRISE_LOGIN_ENABLED: 'true',
    LOGIN_ENCRYPTION_KEY: opaque(), GOOGLE_OIDC_CLIENT_ID: 'fixture-google',
    GOOGLE_OIDC_CLIENT_SECRET: 'fixture-google-secret', ENTRA_OIDC_CLIENT_ID: 'fixture-entra',
    ENTRA_OIDC_CLIENT_SECRET: 'fixture-entra-secret', ENTRA_TENANT_ID: tenant,
  };
  sql.exec("INSERT INTO organizations VALUES('org-a','Synthetic A','active'),('org-b','Synthetic B','active'),('org-suspended','Suspended','suspended');");
  sql.exec("INSERT INTO enterprise_users VALUES('alice'),('bob');");
  sql.exec("INSERT INTO memberships VALUES('org-a','alice','requester','active'),('org-b','bob','administrator','active'),('org-suspended','alice','technician','active');");
  for (const provider of ['google', 'entra'] as const) sql.prepare('INSERT INTO external_identities VALUES(?,?,?)').run('alice', issuer[provider], 'alice-subject');
  const state = { begins: 0, exchanges: 0, subject: 'alice-subject', throwExchange: false,
    beforeReturn: undefined as (() => Promise<void>) | undefined, transactions: [] as OidcTransaction[] };
  const factory: typeof createEnterpriseOidcClient = config => ({
    async begin() {
      state.begins++;
      const transaction = { state: opaque(), nonce: opaque(), codeVerifier: opaque(), redirectUri: config.redirectUri };
      state.transactions.push(transaction);
      return { authorizationUrl: issuer[config.provider] + '/authorize?state=' + transaction.state, transaction };
    },
    async exchange(_callback, transaction) {
      state.exchanges++;
      assert.deepEqual(transaction, state.transactions.find(saved => saved.state === transaction.state), 'Stored PKCE/nonce round-trips unchanged');
      await state.beforeReturn?.();
      if (state.throwExchange) throw new Error('PRIVATE_PROVIDER_TOKEN_DO_NOT_EXPOSE');
      return { issuer: issuer[config.provider], subject: state.subject };
    },
  });
  async function call(path: string, options: { method?: string; body?: string; headers?: Record<string, string>; environment?: Partial<EnterpriseAuthEnvironment>; requestOrigin?: string } = {}) {
    const method = options.method ?? (path.endsWith('/start') || path.endsWith('/logout') ? 'POST' : 'GET');
    const response = await handleEnterpriseAuth(new Request((options.requestOrigin ?? origin) + path, {
      method, headers: { origin, 'content-type': 'application/json', ...options.headers },
      ...(method === 'POST' ? { body: options.body ?? '{}' } : {}),
    }), { ...env, ...options.environment }, factory);
    assert.ok(response);
    hardening(response);
    return response;
  }
  async function start(provider: Provider = 'google', headers: Record<string, string> = {}) {
    const response = await call('/api/v2/auth/' + provider + '/start', { headers });
    assert.equal(response.status, 200);
    const transaction = state.transactions.at(-1)!;
    return { response, transaction, browserCookie: cookie(response, '__Host-relay_login'),
      callback: '/api/v2/auth/' + provider + '/callback?state=' + transaction.state + '&code=fixture-code' };
  }
  function countSessions() { return Number(sql.prepare('SELECT count(*) AS count FROM sessions').get()!.count); }
  return { sql, db, env, state, call, start, countSessions };
}

test('enterprise auth Google and tenant-specific Entra issue opaque, secure sessions only for preprovisioned identities', async t => {
  for (const provider of ['google', 'entra'] as const) {
    const f = await fixture(t);
    assert.deepEqual(enterpriseLoginProviders(f.env), ['google', 'entra']);
    const started = await f.start(provider);
    const browserHeader = started.response.headers.getSetCookie()[0];
    assert.match(browserHeader, /^__Host-relay_login=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
    assert.equal(browserHeader.includes('Domain='), false);
    const response = await f.call(started.callback, { headers: { cookie: started.browserCookie } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), origin + '/api/v2/auth/session');
    assert.match(response.headers.getSetCookie().find(value => value.startsWith('__Host-relay_session='))!, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
    assert.match(cookie(response, '__Host-relay_login'), /^__Host-relay_login=$/);
    const token = cookie(response, '__Host-relay_session').split('=')[1];
    const stored = f.sql.prepare('SELECT token_hash,user_id FROM sessions').get()!;
    assert.equal(stored.token_hash, await sha256(token));
    assert.equal(stored.user_id, 'alice');
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM login_transactions').all()).includes(started.transaction.codeVerifier), false);
    assert.equal(f.state.exchanges, 1);
  }
});

test('enterprise auth stays disabled with absent or invalid provider configuration', async t => {
  const f = await fixture(t);
  for (const patch of [
    { ENTERPRISE_LOGIN_ENABLED: undefined }, { ENTERPRISE_LOGIN_ENABLED: 'TRUE' },
    { LOGIN_ENCRYPTION_KEY: undefined }, { LOGIN_ENCRYPTION_KEY: 'invalid' },
    { GOOGLE_OIDC_CLIENT_ID: '' }, { GOOGLE_OIDC_CLIENT_SECRET: '' },
    { APP_ORIGIN: 'http://relay.example.invalid' },
  ]) assert.equal((await f.call('/api/v2/auth/google/start', { environment: patch })).status, 503);
  assert.equal((await f.call('/api/v2/auth/entra/start', { environment: { ENTRA_TENANT_ID: 'common' } })).status, 503);
  assert.equal(f.state.begins, 0);
  assert.deepEqual(enterpriseLoginProviders({ ...f.env, ENTERPRISE_LOGIN_ENABLED: 'false' }), []);
});

test('enterprise auth start enforces same-origin empty POST with exact routes and parameters', async t => {
  const f = await fixture(t);
  for (const [options, status] of [
    [{ headers: { origin: 'https://attacker.example.invalid' } }, 403],
    [{ headers: { origin: '' } }, 403],
    [{ headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    [{ requestOrigin: 'https://attacker.example.invalid' }, 403],
    [{ body: '{"role":"administrator"}' }, 400],
    [{ body: '[]' }, 400],
    [{ body: 'null' }, 400],
    [{ body: 'broken' }, 400],
    [{ method: 'GET' }, 405],
  ] as const) assert.equal((await f.call('/api/v2/auth/google/start', options)).status, status);
  assert.equal((await f.call('/api/v2/auth/google/start?returnTo=https://attacker.example.invalid', { method: 'POST' })).status, 400);
  assert.equal((await f.call('/api/v2/auth/unknown/start')).status, 404);
  assert.equal(f.state.begins, 0);
});

test('enterprise auth callback rejects wrong or duplicate browser binding, state and parameters before exchanging', async t => {
  const f = await fixture(t);
  const s = await f.start();
  for (const [path, headers] of [
    [s.callback, {}],
    [s.callback, { cookie: '__Host-relay_login=' + opaque() }],
    [s.callback, { cookie: s.browserCookie + '; ' + s.browserCookie }],
    [s.callback.replace(s.transaction.state, opaque()), { cookie: s.browserCookie }],
    [s.callback + '&state=' + s.transaction.state, { cookie: s.browserCookie }],
    [s.callback + '&code=second', { cookie: s.browserCookie }],
    [s.callback + '&returnTo=https://attacker.example.invalid', { cookie: s.browserCookie }],
    [s.callback.replace('/google/', '/entra/'), { cookie: s.browserCookie }],
  ] as const) {
    const response = await f.call(path, { headers });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
    assert.equal(cookie(response, '__Host-relay_login'), '__Host-relay_login=');
  }
  assert.equal(f.state.exchanges, 0);
  assert.equal(f.countSessions(), 0);
  assert.equal((await f.call(s.callback, { headers: { cookie: s.browserCookie } })).status, 303);
});

test('enterprise auth replay and concurrent callbacks perform exactly one exchange and session issuance', async t => {
  const f = await fixture(t);
  const s = await f.start();
  const responses = await Promise.all(Array.from({ length: 6 }, () => f.call(s.callback, { headers: { cookie: s.browserCookie } })));
  assert.deepEqual(responses.map(response => response.status).sort(), [303, 400, 400, 400, 400, 400]);
  assert.equal(f.state.exchanges, 1);
  assert.equal(f.countSessions(), 1);
  assert.equal((await f.call(s.callback, { headers: { cookie: s.browserCookie } })).status, 400);
});

test('enterprise auth failed exchange consumes the attempt and never leaks provider details', async t => {
  const f = await fixture(t);
  const s = await f.start();
  f.state.throwExchange = true;
  const failed = await f.call(s.callback, { headers: { cookie: s.browserCookie } });
  assert.equal(failed.status, 400);
  assert.equal((await failed.text()).includes('PRIVATE_PROVIDER_TOKEN'), false);
  f.state.throwExchange = false;
  assert.equal((await f.call(s.callback, { headers: { cookie: s.browserCookie } })).status, 400);
  assert.equal(f.state.exchanges, 1);
  assert.equal(f.countSessions(), 0);
});

test('enterprise auth never creates identities or role grants from unknown subjects or email-like subjects', async t => {
  const f = await fixture(t);
  for (const subject of ['unknown-subject', 'administrator@approved-domain.example.invalid']) {
    f.state.subject = subject;
    const s = await f.start();
    const response = await f.call(s.callback, { headers: { cookie: s.browserCookie, 'x-relay-role': 'administrator', 'oai-authenticated-user-id': 'alice' } });
    assert.equal(response.status, 403);
    assert.equal(cookie(response, '__Host-relay_session'), '');
  }
  assert.equal(f.countSessions(), 0);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM enterprise_users').get()!.n, 2);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM memberships').get()!.n, 3);
});

test('enterprise auth checks active membership and organization at issuance time after provider exchange', async t => {
  for (const mutation of [
    "UPDATE memberships SET status='revoked' WHERE user_id='alice'",
    "UPDATE organizations SET status='suspended' WHERE id='org-a'",
  ]) {
    const f = await fixture(t);
    const s = await f.start();
    f.state.beforeReturn = async () => { f.sql.exec(mutation); };
    assert.equal((await f.call(s.callback, { headers: { cookie: s.browserCookie } })).status, 403);
    assert.equal(f.countSessions(), 0);
  }
});

test('enterprise auth rotates the presented session and profile excludes foreign, revoked and suspended memberships', async t => {
  const f = await fixture(t);
  const first = await f.start();
  const signedIn = await f.call(first.callback, { headers: { cookie: first.browserCookie } });
  const oldCookie = cookie(signedIn, '__Host-relay_session');
  f.sql.exec("INSERT INTO organizations VALUES('org-revoked','Revoked','active'); INSERT INTO memberships VALUES('org-revoked','alice','administrator','revoked');");
  const second = await f.start('entra');
  const rotated = await f.call(second.callback, { headers: { cookie: second.browserCookie + '; ' + oldCookie } });
  assert.equal(rotated.status, 303);
  const newCookie = cookie(rotated, '__Host-relay_session');
  assert.notEqual(newCookie, oldCookie);
  assert.equal((await f.call('/api/v2/auth/session', { headers: { cookie: oldCookie } })).status, 401);
  const profile = await f.call('/api/v2/auth/session', { headers: { cookie: newCookie } });
  assert.deepEqual(await profile.json(), { userId: 'alice', memberships: [{ organizationId: 'org-a', role: 'requester', name: 'Synthetic A' }], limit: 200 });
});

test('enterprise auth profile rejects forged, duplicate, future, expired and revoked sessions', async t => {
  const f = await fixture(t);
  const s = await f.start();
  const signedIn = await f.call(s.callback, { headers: { cookie: s.browserCookie } });
  assert.equal(signedIn.status, 303);
  const session = cookie(signedIn, '__Host-relay_session');
  assert.equal((await f.call('/api/v2/auth/session', { headers: { cookie: session } })).status, 200);
  for (const headers of [
    { 'x-relay-role': 'administrator', 'oai-authenticated-user-id': 'alice' },
    { cookie: '__Host-relay_session=alice' },
    { cookie: '__Host-relay_session=' + opaque() },
    { cookie: session + '; ' + session },
  ] as Record<string, string>[]) assert.equal((await f.call('/api/v2/auth/session', { headers })).status, 401);
  for (const update of [
    "UPDATE sessions SET created_at='2098-01-01T00:00:00.000Z',expires_at='2099-01-01T00:00:00.000Z'",
    "UPDATE sessions SET created_at='2020-01-01T00:00:00.000Z',expires_at='2021-01-01T00:00:00.000Z'",
    "UPDATE sessions SET expires_at='2099-01-01T00:00:00.000Z',revoked_at='2022-01-01T00:00:00.000Z'",
  ]) {
    f.sql.exec(update);
    assert.equal((await f.call('/api/v2/auth/session', { headers: { cookie: session } })).status, 401);
  }
});

test('enterprise auth logout rejects cross-site attempts, revokes session and cancels pending login', async t => {
  const f = await fixture(t);
  const s = await f.start();
  const signedIn = await f.call(s.callback, { headers: { cookie: s.browserCookie } });
  assert.equal(signedIn.status, 303);
  const session = cookie(signedIn, '__Host-relay_session');
  assert.equal((await f.call('/api/v2/auth/session', { headers: { cookie: session } })).status, 200);
  const pending = await f.start();
  const cookies = session + '; ' + pending.browserCookie;
  assert.equal((await f.call('/api/v2/auth/logout', { headers: { cookie: cookies, origin: 'https://attacker.example.invalid' } })).status, 403);
  assert.equal((await f.call('/api/v2/auth/session', { headers: { cookie: session } })).status, 200);
  const loggedOut = await f.call('/api/v2/auth/logout', { headers: { cookie: cookies } });
  assert.equal(loggedOut.status, 204);
  assert.equal(loggedOut.headers.getSetCookie().length, 2);
  for (const item of loggedOut.headers.getSetCookie()) assert.match(item, /Max-Age=0$/);
  assert.equal((await f.call('/api/v2/auth/session', { headers: { cookie: session } })).status, 401);
  assert.equal((await f.call(pending.callback, { headers: { cookie: pending.browserCookie } })).status, 400);
});

test('enterprise auth logout during provider exchange prevents a late callback from restoring access', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const s = await f.start();
  let release!: () => void;
  let entered!: () => void;
  const pause = new Promise<void>(resolve => { release = resolve; });
  const exchanging = new Promise<void>(resolve => { entered = resolve; });
  f.state.beforeReturn = async () => { entered(); await pause; };
  const callback = f.call(s.callback, { headers: { cookie: s.browserCookie } });
  await exchanging;
  const logout = await f.call('/api/v2/auth/logout', { headers: { cookie: s.browserCookie } });
  assert.equal(logout.status, 204);
  release();
  const late = await callback;
  assert.notEqual(late.status, 303);
  assert.equal(cookie(late, '__Host-relay_session'), '');
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM sessions WHERE revoked_at IS NULL').get()!.n, 0);
});

test('enterprise auth restarting login invalidates the previous browser-bound attempt', async t => {
  const f = await fixture(t);
  const first = await f.start();
  const second = await f.start('entra', { cookie: first.browserCookie });
  assert.equal((await f.call(first.callback, { headers: { cookie: first.browserCookie } })).status, 400);
  assert.equal((await f.call(second.callback, { headers: { cookie: second.browserCookie } })).status, 303);
  assert.equal(f.state.exchanges, 1);
});

test('enterprise auth storage failures return a safe worker error with no SQL or credential leakage', async t => {
  const f = await fixture(t);
  const unsafe = 'SQL_PRIVATE_DATA_GOOGLE_SECRET';
  const broken = { prepare: () => { throw new Error(unsafe); }, batch: async () => { throw new Error(unsafe); } } as unknown as Parameters<typeof handleEnterpriseRequest>[1]['ENTERPRISE_DB'];
  const messages: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { messages.push(args); };
  try {
    const response = await handleEnterpriseRequest(new Request(origin + '/api/v2/auth/session', { headers: { cookie: '__Host-relay_session=' + opaque() } }), { ...f.env, ENTERPRISE_DB: broken });
    assert.equal(response.status, 500);
    const output = await response.text();
    assert.equal(output.includes(unsafe), false);
    assert.equal(JSON.stringify(messages).includes(unsafe), false);
    assert.match((JSON.parse(output) as { requestId: string }).requestId, /^[0-9a-f-]{36}$/);
  } finally { console.error = original; }
});
