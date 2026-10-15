// Run only against an isolated local Worker. Identity headers simulate Sites
// dispatch; hosted identity stripping and real sign-in need separate evidence.
import assert from 'node:assert/strict';
const base = new URL(process.env.RELAY_TEST_URL ?? 'http://127.0.0.1:8789');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw new Error('Access fixtures require a local HTTP Worker.');
}
const run = crypto.randomUUID();
const alice = { id: `access-a-${run}`, email: 'owner-a@example.invalid' };
const bob = { id: `access-b-${run}`, email: 'owner-b@example.invalid' };
const staff = process.env.RELAY_TEST_SUPPORT_EMAIL
  ? { id: `access-staff-${run}`, email: process.env.RELAY_TEST_SUPPORT_EMAIL }
  : null;
const fixtures = [];
let assertions = 0;
async function request(path, { user = alice, method = 'GET', body, status = 200, headers = {} } = {}) {
  const response = await fetch(new URL(path, base), {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Connection: 'close',
      ...(user ? { 'oai-authenticated-user-id': user.id, 'oai-authenticated-user-email': user.email } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`${method} ${path}: HTTP ${response.status}, expected JSON; ${text.slice(0, 160)}`); }
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  assertions++;
  return data;
}
const forged = { cookie: `relay_user_id=${alice.id}; relay_role=admin; relay_email=support@relay.test`, 'x-relay-role': 'admin', 'oai-authenticated-user-role': 'admin' };
try {
  await request('/api/cases', { user: null, headers: forged, status: 401 });
  for (const user of [alice, bob]) {
    const data = await request('/api/cases', { user, method: 'POST', status: 201, body: {
      title: `Access fixture ${run}`, description: 'Synthetic access verification; no actual device data.',
      deviceName: 'Local fixture', category: 'network', os: 'windows11', ownership: 'personal', consent: true,
    } });
    fixtures.push({ id: data.case.id, user });
  }
  for (const fixture of fixtures) {
    const path = `/api/cases/${fixture.id}`;
    const other = fixture.user === alice ? bob : alice;
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      await request(path, { user: other, method, headers: forged, status: 404,
        ...(method === 'PATCH' ? { body: { notes: 'Unauthorized replacement' } } : {}) });
    }
    const { case: saved } = await request(path, { user: fixture.user, method: 'PATCH', body: { notes: 'Owner note', status: 'resolved' } });
    const { case: reread } = await request(path, { user: fixture.user });
    assert.equal(reread.notes, 'Owner note');
    assert.equal(reread.verifiedAt, saved.verifiedAt);
    assert.ok(reread.verifiedAt);
    assert.equal('internalNotes' in reread, false);
    assert.equal('userId' in reread, false);
    const list = await request('/api/cases', { user: other, headers: forged });
    assert.equal(list.cases.some(item => item.id === fixture.id), false);
  }
  if (staff) {
    const path = `/api/cases/${fixtures[0].id}`;
    await request('/api/cases?scope=queue', { user: bob, headers: forged, status: 403 });
    await request('/api/cases?scope=queue', { user: staff });
    const before = (await request(path)).case;
    await request(path, { user: staff, method: 'PATCH', body: { internalNotes: 'Private test note', assignedTo: staff.id, status: 'in_progress' } });
    const customer = (await request(path)).case;
    assert.equal('internalNotes' in customer, false);
    assert.equal(customer.verifiedAt, before.verifiedAt, 'Staff cannot change customer resolution report');
    const support = (await request(path, { user: staff })).case;
    assert.equal(support.internalNotes, 'Private test note');
    await request(path, { method: 'PATCH', body: { internalNotes: 'Forged' }, status: 403 });
    await request(path, { user: staff, method: 'DELETE', status: 403 });
  }
} finally {
  const errors = [];
  for (const fixture of fixtures) {
    try {
      await request(`/api/cases/${fixture.id}`, { user: fixture.user, method: 'DELETE' });
      await request(`/api/cases/${fixture.id}`, { user: fixture.user, status: 404 });
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, `Fixture cleanup failed for run ${run}`);
}
console.log(`Passed ${assertions} HTTP assertions plus response checks. Support matrix ${staff ? 'exercised' : 'NOT exercised (no RELAY_TEST_SUPPORT_EMAIL)'}.`);
