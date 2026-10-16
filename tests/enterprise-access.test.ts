// Test-only seeded sessions simulate post-OIDC persistence. They are not a
// login bypass, shipped persona or evidence of live Entra/Google acceptance.
import assert from 'node:assert/strict';
import type { D1Database } from '@cloudflare/workers-types';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleEnterpriseRequest } from '../enterprise/worker';
import { sha256, validateEnterpriseCase } from '../lib/enterprise/http';
import { createEnterpriseCase, resolveEnterprisePrincipal } from '../lib/enterprise/store';
import type { EnterpriseCase } from '../lib/enterprise/contracts';

const organizationA = 'a1111111-1111-4111-8111-111111111111';
const organizationB = 'b2222222-2222-4222-8222-222222222222';
const origin = 'https://relay.example.invalid';
const input = { title: 'Synthetic investigation', description: 'Synthetic fixture; no real customer or device.', platform: 'windows', deviceAuthorization: true, storageConsent: true };
type Binding = string | number | null;
async function caseBody(response: Response) {
  return await response.json() as { case: EnterpriseCase; cases: EnterpriseCase[]; replayed: boolean };
}
async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync('enterprise/migrations/0001_foundation.sql', 'utf8'));
  const db = {
    prepare(query: string) {
      const wrap = (bindings: Binding[] = []): unknown => ({
        bind: (...values: Binding[]) => wrap(values),
        first: async () => sql.prepare(query).get(...bindings) ?? null,
        all: async () => ({ success: true, results: sql.prepare(query).all(...bindings), meta: {} }),
        query, bindings,
      });
      return wrap();
    },
    async batch(statements: { query: string; bindings: Binding[] }[]) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(statement => ({ success: true, results: sql.prepare(statement.query).all(...statement.bindings), meta: {} }));
        sql.exec('COMMIT');
        return result;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  for (const [id, name] of [[organizationA, 'Synthetic A'], [organizationB, 'Synthetic B']]) {
    sql.prepare('INSERT INTO organizations VALUES(?,?,?)').run(id, name, 'active');
  }
  const tokens: Record<string, string> = {};
  for (const [user, org, role] of [['alice', organizationA, 'requester'], ['alex', organizationA, 'requester'], ['tech', organizationA, 'technician'], ['admin', organizationA, 'administrator'], ['bob', organizationB, 'requester']]) {
    sql.prepare('INSERT INTO enterprise_users VALUES(?)').run(user);
    sql.prepare('INSERT INTO external_identities VALUES(?,?,?)').run(user, 'https://issuer.example.invalid', user);
    sql.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(org, user, role, 'active');
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    tokens[user] = token;
    sql.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,NULL)').run(`session-${user}`, await sha256(token), user, '2020-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
  }
  async function request(path = `/api/v2/organizations/${organizationA}/cases`, options: { user?: string | null; method?: string; body?: unknown; key?: string; headers?: Record<string, string> } = {}) {
    const user = options.user === undefined ? 'alice' : options.user;
    const headers: Record<string, string> = { Origin: origin, 'Content-Type': 'application/json',
      ...(user ? { Cookie: `__Host-relay_session=${tokens[user]}` } : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}), ...options.headers };
    return handleEnterpriseRequest(new Request(origin + path, { method: options.method ?? 'GET', headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) }), { ENTERPRISE_DB: db, APP_ORIGIN: origin });
  }
  return { sql, db, tokens, request };
}

test('enterprise identity headers, unsigned roles and malformed/duplicate opaque cookies cannot authenticate', async () => {
  const f = await fixture();
  try {
    const forgedHeaders: Record<string, string>[] = [
      { 'oai-authenticated-user-id': 'alice', 'oai-authenticated-user-email': 'admin@example.invalid', 'x-relay-role': 'administrator' },
      { Cookie: '__Host-relay_session=alice' },
      { Cookie: `__Host-relay_session=${f.tokens.alice}; __Host-relay_session=${f.tokens.tech}` },
      { Cookie: `__Host-relay_session=${'z'.repeat(43)}` },
    ];
    for (const headers of forgedHeaders) assert.equal((await f.request(undefined, { user: null, headers })).status, 401);
    const missing = await f.request(undefined, { user: null });
    assert.equal(missing.status, 401);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
  } finally { f.sql.close(); }
});

test('tenant case create/list/detail enforces requester ownership and organization staff roles', async () => {
  const f = await fixture();
  try {
    const created = await f.request(undefined, { method: 'POST', body: input, key: crypto.randomUUID() });
    assert.equal(created.status, 201);
    const record = (await caseBody(created)).case;
    const path = `/api/v2/organizations/${organizationA}/cases/${record.id}`;
    assert.equal((await f.request(path)).status, 200);
    assert.equal((await f.request(path, { user: 'alex', headers: { 'x-relay-role': 'administrator' } })).status, 404);
    assert.equal((await f.request(path, { user: 'tech' })).status, 200);
    assert.equal((await f.request(path, { user: 'admin' })).status, 200);
    assert.equal((await f.request(path, { user: 'bob' })).status, 404);
    assert.equal((await f.request(path.replace(organizationA, organizationB), { user: 'bob' })).status, 404);
    assert.equal((await caseBody(await f.request(undefined, { user: 'alex' }))).cases.length, 0);
    assert.equal((await caseBody(await f.request(undefined, { user: 'tech' }))).cases.length, 1);
    const payload = JSON.stringify(record);
    for (const name of ['internalNotes', 'token_hash', 'consent_at', 'device_authorized_at']) assert.equal(payload.includes(name), false);
    const audit = f.sql.prepare('SELECT * FROM audit_events').all();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, 'case.created');
    assert.equal(JSON.stringify(audit).includes(input.description), false);
  } finally { f.sql.close(); }
});

test('revoked/expired/future sessions and suspended organizations cannot access cases', async () => {
  for (const mutation of [
    "UPDATE sessions SET revoked_at='2020-01-02T00:00:00.000Z' WHERE user_id='alice'",
    "UPDATE sessions SET expires_at='2020-01-02T00:00:00.000Z' WHERE user_id='alice'",
    "UPDATE sessions SET created_at='2098-01-01T00:00:00.000Z' WHERE user_id='alice'",
    "UPDATE memberships SET status='revoked' WHERE user_id='alice'",
    "UPDATE organizations SET status='suspended'",
  ]) {
    const f = await fixture();
    try { f.sql.exec(mutation); assert.ok([401, 404].includes((await f.request()).status)); }
    finally { f.sql.close(); }
  }
});

test('enterprise creates preserve UUID retry keys, immutable normalized payload and one audit event', async () => {
  const f = await fixture();
  try {
    const key = crypto.randomUUID();
    const first = await f.request(undefined, { method: 'POST', body: input, key });
    const original = (await caseBody(first)).case;
    const replay = await f.request(undefined, { method: 'POST', body: { ...input, title: ` ${input.title} ` }, key: key.toUpperCase() });
    assert.equal(replay.status, 200);
    const replayed = await caseBody(replay);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.case.id, original.id);
    assert.equal((await f.request(undefined, { method: 'POST', body: { ...input, title: 'Different title' }, key })).status, 409);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM audit_events').get()!.n, 1);
    // Same key in another authorized tenant remains an independent operation.
    assert.equal((await f.request(`/api/v2/organizations/${organizationB}/cases`, { user: 'bob', method: 'POST', body: input, key })).status, 201);
  } finally { f.sql.close(); }
});

test('failed enterprise creation rolls back reservation and audit; subsequent same-key retry succeeds', async () => {
  const f = await fixture();
  try {
    f.sql.exec("CREATE TRIGGER fail_case BEFORE INSERT ON enterprise_cases BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END");
    const key = crypto.randomUUID();
    const log = console.error;
    const logs: string[] = [];
    console.error = value => logs.push(String(value));
    try { assert.equal((await f.request(undefined, { method: 'POST', body: input, key })).status, 500); }
    finally { console.error = log; }
    assert.equal(logs.length, 1);
    assert.equal(logs[0].includes('storage failure'), false);
    assert.equal(logs[0].includes(input.description), false);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_create_requests').get()!.n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM audit_events').get()!.n, 0);
    f.sql.exec('DROP TRIGGER fail_case');
    assert.equal((await f.request(undefined, { method: 'POST', body: input, key })).status, 201);
  } finally { f.sql.close(); }
});

test('revocation between authentication and transactional mutation cannot create a case or reservation', async () => {
  const f = await fixture();
  try {
    const now = new Date().toISOString();
    const principal = await resolveEnterprisePrincipal(f.db, new Request(origin, { headers: { Cookie: `__Host-relay_session=${f.tokens.alice}` } }), organizationA, now);
    f.sql.exec("UPDATE memberships SET status='revoked' WHERE user_id='alice'");
    const validated = validateEnterpriseCase(input);
    assert.ok(validated.ok);
    await assert.rejects(createEnterpriseCase(f.db, principal, validated.value, crypto.randomUUID(), now), { status: 403 });
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_create_requests').get()!.n, 0);
  } finally { f.sql.close(); }
});

test('cross-origin, oversized, unsupported or identity-bearing enterprise mutations fail without saving', async () => {
  const f = await fixture();
  try {
    for (const body of [{ ...input, deviceAuthorization: false }, { ...input, storageConsent: false }, { ...input, platform: ['windows'] },
      { ...input, requesterId: 'tech' }, { ...input, role: 'administrator' }, { ...input, description: 'x'.repeat(4001) },
      { ...input, title: 'Synthetic\u0000case' }, { ...input, description: 'Synthetic\u0000case description' }]) {
      assert.equal((await f.request(undefined, { method: 'POST', key: crypto.randomUUID(), body })).status, 400);
    }
    assert.equal((await f.request(undefined, { method: 'POST', body: input })).status, 400);
    assert.equal((await f.request(undefined, { method: 'POST', body: input, key: crypto.randomUUID(), headers: { Origin: 'https://other.example.invalid' } })).status, 403);
    assert.equal((await f.request(undefined, { method: 'POST', body: input, key: crypto.randomUUID(), headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await f.request(undefined, { method: 'POST', body: { ...input, description: 'x'.repeat(20_000) }, key: crypto.randomUUID() })).status, 413);
    assert.equal((await f.request(undefined, { method: 'POST', body: input, key: crypto.randomUUID(), headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 0);
  } finally { f.sql.close(); }
});

test('unknown enterprise routes and unsupported methods do not enable prototype AI/fix endpoints', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/ai/fix', { method: 'POST', body: { caseId: 'arbitrary' } })).status, 404);
    assert.equal((await f.request(undefined, { method: 'DELETE' })).status, 405);
    const health = await (await f.request('/health', { user: null })).json() as { oidcEnabled: boolean; deviceExecutionEnabled: boolean };
    assert.equal(health.oidcEnabled, false);
    assert.equal(health.deviceExecutionEnabled, false);
  } finally { f.sql.close(); }
});

test('failed audit insertion rolls back case and reservation; deleted originals cannot be resurrected', async () => {
  const f = await fixture();
  try {
    const key = crypto.randomUUID();
    f.sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    const now = new Date().toISOString();
    const principal = await resolveEnterprisePrincipal(f.db, new Request(origin, { headers: { Cookie: `__Host-relay_session=${f.tokens.alice}` } }), organizationA, now);
    const validated = validateEnterpriseCase(input);
    assert.ok(validated.ok);
    await assert.rejects(createEnterpriseCase(f.db, principal, validated.value, key, now));
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_create_requests').get()!.n, 0);
    f.sql.exec('DROP TRIGGER fail_audit');
    assert.equal((await f.request(undefined, { method: 'POST', body: input, key })).status, 201);
    // No deletion API yet. Simulate a future authorized purge with explicit
    // audit cleanup; retained reservations must still block recreation.
    f.sql.exec('DELETE FROM audit_events; DELETE FROM enterprise_cases');
    assert.equal((await f.request(undefined, { method: 'POST', body: input, key })).status, 410);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 0);
  } finally { f.sql.close(); }
});

test('same retry key is independently scoped per requester and missing Origin is denied', async () => {
  const f = await fixture();
  try {
    const key = crypto.randomUUID();
    for (const user of ['alice', 'alex']) assert.equal((await f.request(undefined, { user, method: 'POST', body: input, key })).status, 201);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 2);
    const request = new Request(`${origin}/api/v2/organizations/${organizationA}/cases`, {
      method: 'POST', headers: { Cookie: `__Host-relay_session=${f.tokens.alice}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(input),
    });
    assert.equal((await handleEnterpriseRequest(request, { ENTERPRISE_DB: f.db, APP_ORIGIN: origin })).status, 403);
  } finally { f.sql.close(); }
});

test('reads recheck membership and role after initial principal resolution', async () => {
  const f = await fixture();
  try {
    const response = await f.request(undefined, { method: 'POST', body: input, key: crypto.randomUUID() });
    const record = (await caseBody(response)).case;
    const now = new Date().toISOString();
    const principal = await resolveEnterprisePrincipal(f.db, new Request(origin, { headers: { Cookie: `__Host-relay_session=${f.tokens.tech}` } }), organizationA, now);
    f.sql.exec("UPDATE memberships SET role='requester' WHERE user_id='tech'");
    const { listEnterpriseCases, readEnterpriseCase } = await import('../lib/enterprise/store');
    assert.equal((await listEnterpriseCases(f.db, principal, now)).length, 0);
    await assert.rejects(readEnterpriseCase(f.db, principal, record.id, now), { status: 404 });
    f.sql.exec("UPDATE memberships SET status='revoked' WHERE user_id='tech'");
    assert.equal((await listEnterpriseCases(f.db, principal, now)).length, 0);
  } finally { f.sql.close(); }
});

test('invalid UTF-8 and streamed oversized JSON are rejected without trusted content-length', async () => {
  const f = await fixture();
  try {
    const headers = { Origin: origin, Cookie: `__Host-relay_session=${f.tokens.alice}`,
      'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
    const invalidUtf8 = new Request(`${origin}/api/v2/organizations/${organizationA}/cases`, {
      method: 'POST', headers, body: new Uint8Array([0x7b, 0xff, 0x7d]),
    });
    assert.equal((await handleEnterpriseRequest(invalidUtf8, { ENTERPRISE_DB: f.db, APP_ORIGIN: origin })).status, 400);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(9000)); controller.enqueue(new Uint8Array(9000)); },
      cancel() { cancelled = true; },
    });
    const streamed = new Request(`${origin}/api/v2/organizations/${organizationA}/cases`, {
      method: 'POST', headers, body, duplex: 'half',
    } as RequestInit);
    assert.equal((await handleEnterpriseRequest(streamed, { ENTERPRISE_DB: f.db, APP_ORIGIN: origin })).status, 413);
    assert.equal(cancelled, true);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM enterprise_cases').get()!.n, 0);
  } finally { f.sql.close(); }
});
