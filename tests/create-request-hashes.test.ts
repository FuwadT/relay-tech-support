import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestHashes, parseCreateKey } from '../lib/idempotent-create';
import { InputError, validateIntake } from '../lib/validation';

const key = '7e90d2fa-74d3-44db-914b-85ce08dbbd2f';
const raw = { title: 'Slow test device', description: 'Synthetic diagnostic test only.',
  deviceName: 'Synthetic device', category: 'performance', os: 'windows11',
  ownership: 'personal', consent: true };

test('create key validates UUID syntax and normalizes casing without accepting multiple keys', () => {
  assert.equal(parseCreateKey(null), null);
  assert.equal(parseCreateKey(key.toUpperCase()), key);
  for (const invalid of ['', 'not-a-key', `${key},${key}`, key.replace('-44db-', '-04db-'),
    key.replace('-914b-', '-114b-')]) {
    assert.throws(() => parseCreateKey(invalid), InputError);
  }
});

test('create hashes ignore input property order and validated surrounding whitespace', async () => {
  const normalized = validateIntake(raw);
  const reordered = validateIntake({ consent: true, ownership: raw.ownership, os: raw.os,
    category: raw.category, deviceName: ` ${raw.deviceName} `,
    description: ` ${raw.description} `, title: ` ${raw.title} ` });
  const hashes = await createRequestHashes(key, normalized);
  assert.deepEqual(await createRequestHashes(key, reordered), hashes);
  assert.match(hashes.keyHash, /^[0-9a-f]{64}$/);
  assert.match(hashes.payloadHash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(hashes).includes(raw.description));
  assert.notEqual(hashes.keyHash, key);
});

test('every validated intake field participates in the retry fingerprint', async () => {
  const normalized = validateIntake(raw);
  const original = await createRequestHashes(key, normalized);
  for (const update of [{ title: 'Other test title' }, { description: 'Changed synthetic description.' },
    { deviceName: 'Other synthetic device' }, { category: 'network' as const }]) {
    const changed = await createRequestHashes(key, { ...normalized, ...update });
    assert.equal(changed.keyHash, original.keyHash);
    assert.notEqual(changed.payloadHash, original.payloadHash);
  }
  const otherKey = await createRequestHashes('8e90d2fa-74d3-44db-914b-85ce08dbbd2f', normalized);
  assert.notEqual(otherKey.keyHash, original.keyHash);
  assert.equal(otherKey.payloadHash, original.payloadHash);
});
