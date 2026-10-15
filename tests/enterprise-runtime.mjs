// Actual local workerd/D1 regression. Seeds only an isolated disposable DB;
// application code receives real opaque-session cookies, never test identities.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const port = Number(process.env.RELAY_ENTERPRISE_TEST_PORT ?? 8802);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Choose a valid isolated test port');
const origin = `http://127.0.0.1:${port}`;
const directory = path.resolve('.sites-runtime', `enterprise-runtime-${randomUUID()}`);
const config = path.resolve('enterprise/wrangler.jsonc');
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js');
const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
await mkdir(directory, { recursive: true });
// Refuse to attach to or terminate an unrelated server occupying the port.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
function cli(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { env: environment, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(`Local Wrangler failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}
function sqlFile(file) {
  return cli(['d1', 'execute', 'ENTERPRISE_DB', '--config', config, '--local', '--persist-to', directory, '--file', file, '--yes']);
}
sqlFile(path.resolve('enterprise/migrations/0001_foundation.sql'));
const org = randomUUID();
const otherOrg = randomUUID();
const actors = Object.fromEntries(['owner', 'peer', 'other', 'technician', 'expired', 'revoked', 'revokedMembership', 'suspended'].map(name => [name, {
  user: randomUUID(), session: randomUUID(), token: randomBytes(32).toString('base64url'),
}]));
const suspendedOrg = randomUUID();
const before = new Date(Date.now() - 3600000).toISOString();
const after = new Date(Date.now() + 3600000).toISOString();
const pastExpiry = new Date(Date.now() - 60000).toISOString();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const rows = [
  `INSERT INTO organizations(id,name,status) VALUES(${quote(org)},'Synthetic runtime A','active'),(${quote(otherOrg)},'Synthetic runtime B','active'),(${quote(suspendedOrg)},'Synthetic suspended','suspended');`,
];
for (const [name, actor] of Object.entries(actors)) {
  const organization = name === 'other' ? otherOrg : name === 'suspended' ? suspendedOrg : org;
  const tokenHash = createHash('sha256').update(actor.token).digest('hex');
  rows.push(`INSERT INTO enterprise_users(id) VALUES(${quote(actor.user)});`);
  rows.push(`INSERT INTO memberships(org_id,user_id,role,status) VALUES(${quote(organization)},${quote(actor.user)},${quote(name === 'technician' ? 'technician' : 'requester')},${quote(name === 'revokedMembership' ? 'revoked' : 'active')});`);
  rows.push(`INSERT INTO sessions(id,token_hash,user_id,created_at,expires_at,revoked_at) VALUES(${quote(actor.session)},${quote(tokenHash)},${quote(actor.user)},${quote(before)},${quote(name === 'expired' ? pastExpiry : after)},${name === 'revoked' ? quote(before) : 'NULL'});`);
}
// DB-only failure injection exercises the production D1 batch rollback without
// adding a failure endpoint, test identity branch or hook to deployable code.
rows.push("CREATE TRIGGER synthetic_case_failure BEFORE INSERT ON enterprise_cases WHEN NEW.title = 'Forced rollback fixture' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
rows.push("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events WHEN EXISTS(SELECT 1 FROM enterprise_cases WHERE id = NEW.case_id AND title = 'Forced audit rollback fixture') BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END;");
const seedPath = path.join(directory, 'synthetic-seed.sql');
await writeFile(seedPath, rows.join('\n'));
sqlFile(seedPath);

let output = '';
const worker = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--local', '--ip', '127.0.0.1', '--port', String(port),
  '--inspector-port', '0', '--persist-to', directory, '--var', `APP_ORIGIN:${origin}`],
{ env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
worker.stdout.on('data', data => { output = (output + data.toString()).slice(-16000); });
worker.stderr.on('data', data => { output = (output + data.toString()).slice(-16000); });
let checks = 0;
async function call({ actor = 'owner', organization = org, method = 'GET', id, body, key, headers = {}, expected = 200, raw, endpoint, omitOrigin = false } = {}) {
  const response = await fetch(`${origin}${endpoint ?? `/api/v2/organizations/${organization}/cases${id ? `/${id}` : ''}`}`, {
    method, signal: AbortSignal.timeout(10000), redirect: 'error', headers: {
      ...(actor ? { cookie: `__Host-relay_session=${actors[actor].token}` } : {}),
      ...(method === 'POST' ? { ...(!omitOrigin ? { origin } : {}), 'content-type': 'application/json', 'idempotency-key': key ?? randomUUID() } : {}),
      ...headers,
    }, ...(method === 'POST' ? { body: raw ?? JSON.stringify(body ?? intake) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method}: ${JSON.stringify(data)}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  checks++;
  return data;
}
const intake = { title: 'Synthetic enterprise runtime', description: 'Local test only; no real device was scanned.', platform: 'windows', deviceAuthorization: true, storageConsent: true };
async function health() {
  const data = await call({ actor: null, endpoint: '/health' });
  assert.equal(data.service, 'relay-enterprise');
  assert.equal(data.oidcEnabled, false);
}
async function rejectThenHealth(options) {
  await call({ method: 'POST', ...options });
  await health();
}
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (worker.exitCode !== null) throw new Error(`Local Worker exited: ${output}`);
    if (output.includes('Ready on')) {
      try { await health(); break; } catch (error) { if (Date.now() >= deadline) throw error; }
    }
    if (Date.now() >= deadline) throw new Error(`Local Worker did not start: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await rejectThenHealth({ actor: null, expected: 401 });
  await rejectThenHealth({ actor: null, headers: { 'oai-authenticated-user-id': actors.owner.user, 'x-relay-role': 'administrator' }, expected: 401 });
  await rejectThenHealth({ actor: 'expired', expected: 401 });
  await rejectThenHealth({ actor: 'revoked', expected: 401 });
  await rejectThenHealth({ actor: 'revokedMembership', expected: 404 });
  await rejectThenHealth({ actor: 'suspended', organization: suspendedOrg, expected: 404 });
  await rejectThenHealth({ omitOrigin: true, expected: 403 });
  await rejectThenHealth({ headers: { origin: 'https://cross-origin.example.invalid' }, expected: 403 });
  await rejectThenHealth({ headers: { 'sec-fetch-site': 'cross-site' }, expected: 403 });
  await rejectThenHealth({ headers: { 'idempotency-key': 'invalid' }, expected: 400 });
  await rejectThenHealth({ headers: { 'content-type': 'text/plain' }, expected: 415 });
  await rejectThenHealth({ raw: '{malformed', expected: 400 });
  await rejectThenHealth({ raw: 'x'.repeat(17000), expected: 413 });
  await rejectThenHealth({ body: { ...intake, storageConsent: false }, expected: 400 });
  const key = randomUUID();
  const created = await call({ method: 'POST', key, expected: 201 });
  assert.equal(created.replayed, false);
  const replay = await call({ method: 'POST', key });
  assert.equal(replay.replayed, true);
  assert.equal(replay.case.id, created.case.id);
  await call({ method: 'POST', key, body: { ...intake, title: 'Changed synthetic details' }, expected: 409 });
  assert.equal((await call({ id: created.case.id })).case.title, intake.title);
  assert.equal((await call({ actor: 'peer' })).cases.length, 0);
  await call({ actor: 'peer', id: created.case.id, expected: 404 });
  await call({ actor: 'other', id: created.case.id, expected: 404 });
  await call({ actor: 'other', organization: otherOrg, id: created.case.id, expected: 404 });
  assert.equal((await call({ actor: 'technician', id: created.case.id })).case.id, created.case.id);
  const other = await call({ actor: 'other', organization: otherOrg, method: 'POST', key, expected: 201 });
  assert.notEqual(other.case.id, created.case.id);
  const peer = await call({ actor: 'peer', method: 'POST', key, expected: 201 });
  assert.notEqual(peer.case.id, created.case.id);
  const concurrentKey = randomUUID();
  // Read statuses independently because the winning request is nondeterministic.
  const concurrent = await Promise.all(Array.from({ length: 6 }, async () => {
    const response = await fetch(`${origin}/api/v2/organizations/${org}/cases`, { method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { cookie: `__Host-relay_session=${actors.owner.token}`, origin, 'content-type': 'application/json', 'idempotency-key': concurrentKey }, body: JSON.stringify(intake) });
    return { status: response.status, data: await response.json() };
  }));
  assert.deepEqual(concurrent.map(item => item.status).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(concurrent.map(item => item.data.case.id)).size, 1);
  checks += concurrent.length;
  for (const title of ['Forced rollback fixture', 'Forced audit rollback fixture']) {
    const rollbackKey = randomUUID();
    const failure = await call({ method: 'POST', key: rollbackKey, body: { ...intake, title }, expected: 500 });
    assert.ok(failure.requestId);
    assert.doesNotMatch(JSON.stringify(failure), /synthetic failure|synthetic audit failure|INSERT|SQLITE/);
    await health();
    // If the failed batch stranded a reservation this changed-payload retry
    // would conflict. Fresh201 plus final list count checks batch rollback.
    await call({ method: 'POST', key: rollbackKey, expected: 201 });
  }
  assert.equal((await call()).cases.length, 4);
  assert.equal((await call({ actor: 'peer' })).cases.length, 1);
  assert.equal((await call({ actor: 'other', organization: otherOrg })).cases.length, 1);
  console.log(`PASS: ${checks} actual local workerd/D1 HTTP checks plus concurrent, rollback and owner/org assertions.`);
  console.log('Evidence uses seeded opaque sessions in a disposable local DB; hosted OIDC, deployment and real identities are not verified.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (worker.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-worker.pid, 'SIGTERM'); } catch {} }
  }
  // Evidence stays in this ignored unique directory, never a production DB.
  console.log(`Disposable synthetic local state: ${directory}`);
}
