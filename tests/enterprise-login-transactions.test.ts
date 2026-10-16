import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { EnterpriseDatabase } from '../lib/enterprise/store';
import type { OidcTransaction } from '../lib/enterprise/oidc-client';
import { cleanupExpiredLoginTransactions, consumeLoginTransaction, generateOpaqueToken, invalidateBrowserLoginTransactions, saveLoginTransaction } from '../lib/enterprise/login-transactions';

const now = '2026-10-16T12:00:00.000Z';
const expires = '2026-10-16T12:10:00.000Z';
const shortlyAfter = '2026-10-16T12:00:01.000Z';
type Binding = string | number | null;
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(readFileSync('enterprise/migrations/0001_foundation.sql', 'utf8'));
  sql.exec(readFileSync('enterprise/migrations/0002_login_transactions.sql', 'utf8'));
  const db = {
    prepare(query: string) {
      const wrap = (bindings: Binding[] = []): unknown => ({
        bind: (...values: Binding[]) => wrap(values),
        first: async () => sql.prepare(query).get(...bindings) ?? null,
        all: async () => ({ success: true, results: sql.prepare(query).all(...bindings), meta: {} }),
        run: async () => ({ success: true, results: [], meta: sql.prepare(query).run(...bindings) }),
      });
      return wrap();
    },
  } as unknown as EnterpriseDatabase;
  const encryptionKey = generateOpaqueToken();
  const browser = generateOpaqueToken();
  const transaction: OidcTransaction = { state: generateOpaqueToken(), nonce: generateOpaqueToken(),
    codeVerifier: generateOpaqueToken(), redirectUri: 'https://relay.example.invalid/api/auth/callback/google' };
  const save = (value = transaction, time = now) => saveLoginTransaction(db, encryptionKey, 'google', value, browser, time);
  const consume = (time = shortlyAfter) => consumeLoginTransaction(db, encryptionKey, 'google', transaction.state, browser, time);
  return { sql, db, encryptionKey, browser, transaction, save, consume };
}

test('login migration is additive and transaction secrets are encrypted with a fresh nonce', async () => {
  const f = fixture();
  try {
    await f.save();
    const second = { ...f.transaction, state: generateOpaqueToken() };
    await f.save(second);
    const rows = f.sql.prepare('SELECT * FROM login_transactions').all();
    assert.equal(rows.length, 2);
    const stored = JSON.stringify(rows);
    for (const secret of [f.encryptionKey, f.browser, f.transaction.state, f.transaction.nonce, f.transaction.codeVerifier, f.transaction.redirectUri]) {
      assert.equal(stored.includes(secret), false);
    }
    assert.notEqual(rows[0].iv, rows[1].iv);
    assert.notEqual(rows[0].encrypted_payload, rows[1].encrypted_payload);
    assert.equal(rows[0].expires_at, expires);
    const restored = await f.consume();
    assert.ok(restored);
    for (const field of Object.keys(f.transaction) as (keyof OidcTransaction)[]) assert.equal(restored[field] === f.transaction[field], true);
    assert.equal(f.sql.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.sql.close(); }
});

test('one atomic claim wins simultaneous callbacks, and duplicate states stay blocked after consumption', async () => {
  const f = fixture();
  try {
    await f.save();
    const attempts = await Promise.all(Array.from({ length: 8 }, () => f.consume()));
    assert.equal(attempts.filter(value => value !== null).length, 1);
    assert.equal(await f.consume(), null);
    await assert.rejects(f.save(), /^Error: Unable to process login transaction\.$/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM login_transactions').get()!.n, 1);
    assert.equal(f.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, shortlyAfter);
  } finally { f.sql.close(); }
});

test('wrong browser, provider, state and malformed callback inputs do not burn a legitimate transaction', async () => {
  const f = fixture();
  try {
    await f.save();
    for (const [provider, state, browser, time] of [
      ['entra', f.transaction.state, f.browser, shortlyAfter],
      ['google', f.transaction.state, generateOpaqueToken(), shortlyAfter],
      ['google', generateOpaqueToken(), f.browser, shortlyAfter],
      ['google', 'invalid', f.browser, shortlyAfter],
      ['google', f.transaction.state, f.browser + '=', shortlyAfter],
      ['google', f.transaction.state, f.browser, '2026-02-30T12:00:00.000Z'],
      ['google', f.transaction.state, f.browser, '2026-10-16T12:00:01Z'],
    ]) assert.equal(await consumeLoginTransaction(f.db, f.encryptionKey, provider as 'google' | 'entra', state, browser, time), null);
    assert.equal(f.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, null);
    assert.ok(await f.consume());
  } finally { f.sql.close(); }
});

test('future-created attempts and the exact ten-minute expiry boundary are rejected', async () => {
  const future = fixture();
  const expired = fixture();
  try {
    await future.save(future.transaction, shortlyAfter);
    assert.equal(await future.consume(now), null);
    assert.equal(future.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, null);
    assert.ok(await future.consume(shortlyAfter));
    await expired.save();
    assert.equal(await expired.consume(expires), null);
    assert.equal(await expired.consume('2026-10-16T12:11:00.000Z'), null);
    assert.equal(expired.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, null);
  } finally { future.sql.close(); expired.sql.close(); }
});

test('ciphertext, IV and authenticated metadata tampering fail closed and burn the claimed attempt', async () => {
  const mutations: ((sql: DatabaseSync) => void)[] = [
    sql => sql.exec("UPDATE login_transactions SET encrypted_payload = CASE substr(encrypted_payload,1,1) WHEN 'A' THEN 'B' ELSE 'A' END || substr(encrypted_payload,2)"),
    sql => sql.exec("UPDATE login_transactions SET iv = CASE substr(iv,1,1) WHEN 'A' THEN 'B' ELSE 'A' END || substr(iv,2)"),
    sql => sql.exec("UPDATE login_transactions SET created_at = '2026-10-16T12:00:00.001Z'"),
    sql => sql.exec("UPDATE login_transactions SET expires_at = '2026-10-16T12:09:59.999Z'"),
  ];
  for (const mutate of mutations) {
    const f = fixture();
    try {
      await f.save();
      mutate(f.sql);
      assert.equal(await f.consume(), null);
      assert.equal(f.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, shortlyAfter);
      assert.equal(await f.consume(), null);
    } finally { f.sql.close(); }
  }
});

test('moving ciphertext between browser/provider/state contexts cannot authenticate', async () => {
  for (const context of ['provider', 'browser', 'state']) {
    const f = fixture();
    try {
      await f.save();
      const first = f.sql.prepare('SELECT iv, encrypted_payload FROM login_transactions').get()!;
      const second = { ...f.transaction, state: generateOpaqueToken() };
      const browser = context === 'browser' ? generateOpaqueToken() : f.browser;
      const provider = context === 'provider' ? 'entra' : 'google';
      await saveLoginTransaction(f.db, f.encryptionKey, provider, second, browser, now);
      f.sql.prepare('UPDATE login_transactions SET iv = ?, encrypted_payload = ?').run(first.iv, first.encrypted_payload);
      assert.equal(await consumeLoginTransaction(f.db, f.encryptionKey, provider, second.state, browser, shortlyAfter), null);
      assert.ok(await f.consume());
    } finally { f.sql.close(); }
  }
});

test('invalid configuration keys fail before consuming while a wrong valid key burns the attempt', async () => {
  const f = fixture();
  try {
    await f.save();
    const nonCanonical = 'A'.repeat(42) + 'B';
    for (const invalid of ['', 'A'.repeat(42), f.encryptionKey + '=', nonCanonical, ' '.repeat(43)]) {
      await assert.rejects(consumeLoginTransaction(f.db, invalid, 'google', f.transaction.state, f.browser, shortlyAfter));
      await assert.rejects(saveLoginTransaction(f.db, invalid, 'google', { ...f.transaction, state: generateOpaqueToken() }, f.browser, now));
      assert.equal(f.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, null);
    }
    assert.equal(await consumeLoginTransaction(f.db, generateOpaqueToken(), 'google', f.transaction.state, f.browser, shortlyAfter), null);
    assert.equal(await f.consume(), null);
  } finally { f.sql.close(); }
});

test('malformed transactions, timestamps, hashes and excessive lifetimes cannot be stored or restored', async () => {
  const f = fixture();
  try {
    for (const transaction of [
      { ...f.transaction, state: 'short' }, { ...f.transaction, nonce: 'short' },
      { ...f.transaction, codeVerifier: 'short' }, { ...f.transaction, redirectUri: 'http://relay.example.invalid/callback' },
      { ...f.transaction, redirectUri: 'https://relay.example.invalid/callback?return=https://attacker.invalid' },
      { ...f.transaction, unexpected: true },
    ]) await assert.rejects(f.save(transaction));
    for (const time of ['not-a-date', '2026-02-30T12:00:00.000Z', '2026-10-16T12:00:00Z']) await assert.rejects(f.save(f.transaction, time));
    await f.save();
    assert.throws(() => f.sql.exec("UPDATE login_transactions SET expires_at = '2026-10-16T12:10:01.000Z'"), /CHECK/);
    assert.throws(() => f.sql.exec("UPDATE login_transactions SET state_hash = 'not-a-hash'"), /CHECK/);
    f.sql.exec('PRAGMA ignore_check_constraints = ON');
    f.sql.exec("UPDATE login_transactions SET expires_at = '2026-10-16T12:11:00.000Z'");
    assert.equal(await f.consume(), null);
    assert.equal(f.sql.prepare('SELECT consumed_at FROM login_transactions').get()!.consumed_at, shortlyAfter);
  } finally { f.sql.close(); }
});

test('bounded expiry cleanup removes consumed tombstones and expired attempts but preserves live attempts', async () => {
  const f = fixture();
  try {
    await f.save();
    await f.consume();
    await f.save({ ...f.transaction, state: generateOpaqueToken() });
    await f.save({ ...f.transaction, state: generateOpaqueToken() }, shortlyAfter);
    assert.equal(await cleanupExpiredLoginTransactions(f.db, shortlyAfter), 0);
    assert.equal(await cleanupExpiredLoginTransactions(f.db, expires, 1), 1);
    assert.equal(await cleanupExpiredLoginTransactions(f.db, expires), 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM login_transactions').get()!.n, 1);
    for (const limit of [0, 501, 1.5]) await assert.rejects(cleanupExpiredLoginTransactions(f.db, expires, limit));
    await assert.rejects(cleanupExpiredLoginTransactions(f.db, 'invalid'));
  } finally { f.sql.close(); }
});


test('logout invalidates live browser attempts across providers without consuming other browsers', async () => {
  const f = fixture();
  try {
    await f.save();
    const otherProvider = { ...f.transaction, state: generateOpaqueToken() };
    await saveLoginTransaction(f.db, f.encryptionKey, 'entra', otherProvider, f.browser, now);
    const otherBrowser = generateOpaqueToken();
    const other = { ...f.transaction, state: generateOpaqueToken() };
    await saveLoginTransaction(f.db, f.encryptionKey, 'google', other, otherBrowser, now);
    await invalidateBrowserLoginTransactions(f.db, 'invalid', shortlyAfter);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM login_transactions WHERE consumed_at IS NULL').get()!.n, 3);
    await invalidateBrowserLoginTransactions(f.db, f.browser, shortlyAfter);
    assert.equal(await f.consume(), null);
    assert.equal(await consumeLoginTransaction(f.db, f.encryptionKey, 'entra', otherProvider.state, f.browser, shortlyAfter), null);
    assert.ok(await consumeLoginTransaction(f.db, f.encryptionKey, 'google', other.state, otherBrowser, shortlyAfter));
    await invalidateBrowserLoginTransactions(f.db, f.browser, expires);
    await assert.rejects(invalidateBrowserLoginTransactions(f.db, f.browser, 'invalid'));
  } finally { f.sql.close(); }
});
