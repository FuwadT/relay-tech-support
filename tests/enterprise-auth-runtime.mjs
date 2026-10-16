// Isolated HTTPS workerd/D1 checks; identities exist only in this disposable test database.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const port = Number(process.env.RELAY_ENTERPRISE_AUTH_TEST_PORT ?? 8814);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `https://127.0.0.1:${port}`;
const directory = path.resolve('.sites-runtime', `enterprise-auth-${randomUUID()}`);
const config = path.resolve('enterprise/wrangler.jsonc');
const wrangler = path.resolve('node_modules/wrangler/bin/wrangler.js');
const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
await mkdir(directory, { recursive: true });
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
function executeSql(file) {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'ENTERPRISE_DB', '--config', config,
    '--local', '--persist-to', directory, '--file', file, '--yes'],
  { env: environment, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(`Disposable D1 setup failed: ${result.error?.message ?? result.stderr}`);
}
for (const file of (await readdir('enterprise/migrations')).filter(name => name.endsWith('.sql')).sort()) {
  executeSql(path.resolve('enterprise/migrations', file));
}
const hash = value => createHash('sha256').update(value).digest('hex');
const tokens = Object.fromEntries(['owner', 'peer', 'linked', 'expired', 'revoked', 'browser'].map(name => [name, randomBytes(32).toString('base64url')]));
const before = new Date(Date.now() - 60000).toISOString();
const expiry = new Date(Date.now() + 3600000).toISOString();
const loginExpiry = new Date(Date.parse(before) + 600000).toISOString();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = [
  "INSERT INTO organizations VALUES('org-a','Synthetic A','active'),('org-b','Synthetic B','active'),('suspended','Synthetic suspended','suspended');",
  "INSERT INTO enterprise_users VALUES('owner'),('peer');",
  "INSERT INTO memberships VALUES('org-a','owner','requester','active'),('org-b','peer','technician','active'),('suspended','owner','administrator','active');",
];
for (const name of ['owner', 'peer', 'linked', 'expired', 'revoked']) {
  sql.push(`INSERT INTO sessions VALUES(${quote(name)},${quote(hash(tokens[name]))},${quote(name === 'peer' ? 'peer' : 'owner')},${quote(before)},${quote(name === 'expired' ? new Date(Date.now() - 1000).toISOString() : expiry)},${name === 'revoked' ? quote(before) : 'NULL'});`);
}
sql.push(`INSERT INTO login_transactions(state_hash,provider,browser_hash,created_at,expires_at,iv,encrypted_payload,consumed_at,session_id)
  VALUES(${quote('a'.repeat(64))},'google',${quote(hash(tokens.browser))},${quote(before)},${quote(loginExpiry)},${quote('A'.repeat(16))},${quote('A'.repeat(32))},${quote(before)},'linked');`);
const seed = path.join(directory, 'seed.sql');
await writeFile(seed, sql.join('\n'));
executeSql(seed);

// A self-signed certificate is trusted only for this owned loopback test socket.
// No process-wide TLS bypass or external fetch override is installed.
function call(route, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: '127.0.0.1', port, path: route, method,
      rejectUnauthorized: false, headers, timeout: 10000 }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 65536) { response.destroy(new Error('Unexpected test response size')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
let output = '';
const worker = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--local', '--local-protocol', 'https',
  '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--persist-to', directory, '--var', `APP_ORIGIN:${origin}`],
{ env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
worker.stdout.on('data', data => { output = (output + data.toString()).slice(-16000); });
worker.stderr.on('data', data => { output = (output + data.toString()).slice(-16000); });
let checks = 0;
async function check(route, expected, options) {
  const result = await call(route, options);
  assert.equal(result.status, expected, `${route}: ${result.text}`);
  assert.equal(result.headers['cache-control'], 'no-store');
  checks++;
  return result;
}
const session = name => ({ cookie: `__Host-relay_session=${tokens[name]}` });
const post = { method: 'POST', body: '{}', headers: { origin, 'content-type': 'application/json' } };
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { ready = (await call('/health')).status === 200; } catch { /* Wait for the owned worker. */ }
    if (ready) break;
    if (worker.exitCode !== null) throw new Error('Owned Worker exited before becoming ready');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'HTTPS Worker must start');
  const health = JSON.parse((await check('/health', 200)).text);
  assert.equal(health.oidcEnabled, false);
  assert.deepEqual(health.oidcProviders, []);
  await check('/api/v2/auth/google/start', 503, post);
  await check('/api/v2/auth/entra/start', 503, post);
  await check('/api/v2/auth/session', 401);
  await check('/api/v2/auth/session', 401, { headers: { 'oai-authenticated-user-id': 'owner', 'x-relay-role': 'administrator' } });
  await check('/api/v2/auth/session', 401, { headers: { cookie: '__Host-relay_session=owner' } });
  await check('/api/v2/auth/session', 401, { headers: { cookie: `__Host-relay_session=${tokens.owner}; __Host-relay_session=${tokens.peer}` } });
  for (const name of ['expired', 'revoked']) await check('/api/v2/auth/session', 401, { headers: session(name) });
  const profile = JSON.parse((await check('/api/v2/auth/session', 200, { headers: session('owner') })).text);
  assert.deepEqual(profile.memberships, [{ organizationId: 'org-a', role: 'requester', name: 'Synthetic A' }]);
  assert.doesNotMatch(JSON.stringify(profile), /token|nonce|encrypted|secret|org-b/);
  await check('/api/v2/auth/logout', 405, { headers: session('owner') });
  await check('/api/v2/auth/logout', 403, { ...post, headers: { ...post.headers, ...session('owner'), origin: 'https://other.invalid' } });
  await check('/api/v2/auth/session', 200, { headers: session('owner') });
  await check('/api/v2/auth/logout', 400, { ...post, body: '{"role":"administrator"}', headers: { ...post.headers, ...session('owner') } });
  const logout = await check('/api/v2/auth/logout', 204, { ...post,
    headers: { ...post.headers, cookie: `__Host-relay_session=${tokens.owner}; __Host-relay_login=${tokens.browser}` } });
  assert.equal(logout.headers['set-cookie'].length, 2);
  for (const value of logout.headers['set-cookie']) assert.match(value, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0/);
  await check('/api/v2/auth/session', 401, { headers: session('owner') });
  await check('/api/v2/auth/session', 401, { headers: session('linked') });
  await check('/api/v2/auth/session', 200, { headers: session('peer') });
  await check('/api/v2/auth/logout', 204, post);
  console.log(`PASS: ${checks} actual HTTPS workerd/D1 authentication checks with isolated seeded identities.`);
  console.log('Provider callbacks are covered by signed mock fixtures separately; this is not hosted OIDC acceptance.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (worker.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-worker.pid, 'SIGTERM'); } catch {} }
  }
  console.log(`Disposable synthetic state: ${directory}`);
}
