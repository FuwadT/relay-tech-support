// Local built Worker only. Fixture headers simulate trusted Sites dispatch;
// they are not evidence of hosted authentication or transport failure recovery.
import assert from 'node:assert/strict';

const base = new URL(process.env.RELAY_TEST_URL ?? 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') {
  throw new Error('Idempotency fixtures require a loopback HTTP Worker.');
}
const run = crypto.randomUUID();
const owner = `retry-owner-${run}`;
const other = `retry-other-${run}`;
const fixtures = new Map();
let checks = 0;
const intake = {
  title: 'Synthetic retry fixture', description: 'Local verification only; no real device or customer data.',
  deviceName: 'Synthetic device', category: 'performance', os: 'windows11', ownership: 'personal', consent: true,
};

async function call({ user = owner, method = 'POST', path = '/api/cases', body = intake, key, raw } = {}) {
  const response = await fetch(new URL(path, base), {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json', 'Connection': 'close',
      'oai-authenticated-user-id': user, 'oai-authenticated-user-email': 'fixture@example.invalid',
      ...(key === undefined ? {} : { 'Idempotency-Key': key }),
    },
    ...(['GET', 'DELETE'].includes(method) ? {} : { body: raw ?? JSON.stringify(body) }),
  });
  const data = await response.json();
  // Track every created ID before an assertion can fail, including a defective
  // duplicate response. Cleanup must never depend on the feature passing.
  if (method === 'POST' && response.status < 300 && data.case?.id) fixtures.set(data.case.id, user);
  return { status: response.status, data };
}
function expect(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  checks++;
  return result.data;
}
function sameCase(result, id, replayed) {
  assert.equal(result.case.id, id);
  assert.equal(result.replayed, replayed);
  for (const secret of ['userId', 'internalNotes', 'consentAt']) assert.equal(secret in result.case, false);
  checks++;
}
async function ids(user = owner) {
  const result = expect(await call({ user, method: 'GET' }), 200);
  return result.cases.map(item => item.id).sort();
}

try {
  const key = crypto.randomUUID();
  const first = expect(await call({ key }), 201);
  sameCase(first, first.case.id, false);
  // Deliberately discard the first outcome conceptually: retransmit the exact
  // request without consulting its ID, modelling a lost success response.
  sameCase(expect(await call({ key }), 200), first.case.id, true);
  const normalized = { ...intake, title: `  ${intake.title} `, deviceName: ` ${intake.deviceName} `,
    description: ` ${intake.description} ` };
  sameCase(expect(await call({ key, body: normalized }), 200), first.case.id, true);
  sameCase(expect(await call({ key: key.toUpperCase() }), 200), first.case.id, true);
  for (const change of [{ title: 'Different deliberate attempt' }, { category: 'network' }, { description: 'Changed symptom observation.' }]) {
    expect(await call({ key, body: { ...intake, ...change } }), 409);
  }
  sameCase(expect(await call({ key }), 200), first.case.id, true);
  const secondOwner = expect(await call({ user: other, key }), 201);
  assert.notEqual(secondOwner.case.id, first.case.id);
  sameCase(secondOwner, secondOwner.case.id, false);
  sameCase(expect(await call({ user: other, key }), 200), secondOwner.case.id, true);
  expect(await call({ user: other, method: 'GET', path: `/api/cases/${first.case.id}` }), 404);

  const concurrentKey = crypto.randomUUID();
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => call({ key: concurrentKey })));
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 200, 200, 200, 200, 201]);
  const concurrentId = concurrent[0].data.case.id;
  for (const result of concurrent) sameCase(result.data, concurrentId, result.status === 200);
  assert.deepEqual(await ids(), [first.case.id, concurrentId].sort(), 'Only one case per keyed attempt');

  const malformedKey = crypto.randomUUID();
  expect(await call({ key: malformedKey, raw: '{broken' }), 400);
  const afterMalformed = expect(await call({ key: malformedKey }), 201);
  sameCase(afterMalformed, afterMalformed.case.id, false);
  for (const invalidKey of ['', 'not-a-uuid', 'x'.repeat(500)]) expect(await call({ key: invalidKey }), 400);
  const validationKey = crypto.randomUUID();
  expect(await call({ key: validationKey, body: { ...intake, consent: false } }), 400);
  const afterInvalidIntake = expect(await call({ key: validationKey }), 201);
  sameCase(afterInvalidIntake, afterInvalidIntake.case.id, false);

  expect(await call({ method: 'DELETE', path: `/api/cases/${first.case.id}` }), 200);
  expect(await call({ key }), 410);
  expect(await call({ key }), 410);
  expect(await call({ method: 'GET', path: `/api/cases/${first.case.id}` }), 404);
  sameCase(expect(await call({ user: other, key }), 200), secondOwner.case.id, true);
  assert.equal((await ids()).includes(first.case.id), false);
  const deliberateNewAttempt = expect(await call({ key: crypto.randomUUID() }), 201);
  assert.notEqual(deliberateNewAttempt.case.id, first.case.id);

  const legacyOne = expect(await call(), 201);
  const legacyTwo = expect(await call(), 201);
  assert.notEqual(legacyOne.case.id, legacyTwo.case.id, 'Header-free legacy requests retain independent create behavior');
  console.log(`PASS: ${checks} HTTP/response checks plus concurrent, normalization, deletion and owner-isolation assertions.`);
} finally {
  const failures = [];
  for (const [id, user] of fixtures) {
    try {
      const result = await call({ user, method: 'DELETE', path: `/api/cases/${id}` });
      assert.ok([200, 404].includes(result.status), `Fixture cleanup failed: ${id}`);
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Unable to clean up synthetic retry fixtures');
}
