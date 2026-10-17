import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRateLimit } from '../lib/rate-limit';

test('checkRateLimit allows requests within limit and tracks remaining quota', () => {
  const key = `test-key-${Math.random()}`;
  const opts = { windowMs: 10_000, maxRequests: 3 };

  const r1 = checkRateLimit(key, opts);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit(key, opts);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit(key, opts);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  // 4th request exceeds maxRequests = 3
  const r4 = checkRateLimit(key, opts);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.resetAt > Date.now());
});

test('checkRateLimit isolates different keys', () => {
  const keyA = `keyA-${Math.random()}`;
  const keyB = `keyB-${Math.random()}`;
  const opts = { windowMs: 10_000, maxRequests: 1 };

  const a1 = checkRateLimit(keyA, opts);
  assert.equal(a1.allowed, true);

  const a2 = checkRateLimit(keyA, opts);
  assert.equal(a2.allowed, false);

  // keyB is unaffected by keyA
  const b1 = checkRateLimit(keyB, opts);
  assert.equal(b1.allowed, true);
});
