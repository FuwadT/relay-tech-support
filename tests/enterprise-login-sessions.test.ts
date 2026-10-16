import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { EnterpriseDatabase } from '../lib/enterprise/store';
import { sha256 } from '../lib/enterprise/http';
import { consumeLoginTransaction, generateOpaqueToken, saveLoginTransaction } from '../lib/enterprise/login-transactions';
import { cleanupExpiredLoginSessions, endEnterpriseSession, finalizeVerifiedLoginSession } from '../lib/enterprise/login-sessions';

const created = '2026-10-16T12:00:00.000Z';
const now = '2026-10-16T12:00:01.000Z';
const later = '2026-10-16T12:00:02.000Z';
const identity = { issuer: 'https://accounts.google.com', subject: 'synthetic-subject' };
type Binding = string | number | null;
async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_foundation', '0002_login_transactions', '0003_login_finalization']) {
    sql.exec(readFileSync(`enterprise/migrations/${file}.sql`, 'utf8'));
  }
  const db = {
    prepare(query: string) {
      const wrap = (bindings: Binding[] = []): unknown => ({
        bind: (...values: Binding[]) => wrap(values), query, bindings,
        first: async () => sql.prepare(query).get(...bindings) ?? null,
        all: async () => ({ success: true, results: sql.prepare(query).all(...bindings), meta: {} }),
        run: async () => ({ success: true, results: [], meta: sql.prepare(query).run(...bindings) }),
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
  } as unknown as EnterpriseDatabase;
  sql.prepare('INSERT INTO organizations VALUES(?,?,?)').run('org-a', 'Synthetic organization', 'active');
  sql.prepare('INSERT INTO enterprise_users VALUES(?)').run('user-a');
  sql.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run('org-a', 'user-a', 'requester', 'active');
  sql.prepare('INSERT INTO external_identities VALUES(?,?,?)').run('user-a', identity.issuer, identity.subject);
  const previousToken = generateOpaqueToken();
  sql.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,NULL)').run('old-session', await sha256(previousToken), 'user-a', created, '2026-10-16T20:00:00.000Z');
  const encryptionKey = generateOpaqueToken();
  const browserToken = generateOpaqueToken();
  const transaction = { state: generateOpaqueToken(), nonce: generateOpaqueToken(), codeVerifier: generateOpaqueToken(),
    redirectUri: 'https://relay.example.invalid/api/v2/auth/google/callback' };
  await saveLoginTransaction(db, encryptionKey, 'google', transaction, browserToken, created);
  const input = { identity, provider: 'google' as const, state: transaction.state, browserToken, previousToken };
  const consume = (time = now) => consumeLoginTransaction(db, encryptionKey, 'google', transaction.state, browserToken, time);
  const finish = (time = now) => finalizeVerifiedLoginSession(db, input, time);
  return { sql, db, browserToken, previousToken, transaction, input, consume, finish };
}
function count(sql: DatabaseSync) { return sql.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n; }
function oldRevoked(sql: DatabaseSync) { return sql.prepare("SELECT revoked_at FROM sessions WHERE id='old-session'").get()!.revoked_at; }
function row(sql: DatabaseSync) { return sql.prepare('SELECT * FROM login_transactions').get()!; }

test('verified finalization atomically links a hashed eight-hour session and rotates the previous session', async () => {
  const f = await fixture();
  try {
    await f.consume();
    const token = await f.finish();
    assert.ok(token);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(count(f.sql), 2);
    assert.equal(oldRevoked(f.sql), now);
    const session = f.sql.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(await sha256(token))!;
    assert.equal(row(f.sql).session_id, session.id);
    assert.equal(session.expires_at, '2026-10-16T20:00:01.000Z');
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM sessions').all()).includes(token), false);
    assert.equal(row(f.sql).encrypted_payload, 'A'.repeat(32));
    assert.equal(row(f.sql).iv, 'A'.repeat(16));
    assert.equal(await f.consume(), null);
    assert.equal(await f.finish(), null);
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(f.sql.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
  } finally { f.sql.close(); }
});

test('logout during deferred token exchange cancels the consumed transaction and prevents session issuance', async () => {
  const f = await fixture();
  try {
    assert.ok(await f.consume());
    await endEnterpriseSession(f.db, f.previousToken, f.browserToken, now);
    assert.equal(await f.finish(later), null);
    assert.equal(count(f.sql), 1);
    assert.equal(oldRevoked(f.sql), now);
    assert.equal(row(f.sql).cancelled_at, now);
    assert.equal(row(f.sql).encrypted_payload, 'A'.repeat(32));
  } finally { f.sql.close(); }
});

test('logout after finalization revokes the newly linked session even with the previous cookie only', async () => {
  const f = await fixture();
  try {
    await f.consume();
    assert.ok(await f.finish());
    await endEnterpriseSession(f.db, f.previousToken, f.browserToken, later);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL').get()!.n, 0);
    assert.equal(row(f.sql).cancelled_at, later);
    assert.equal(await f.finish(later), null);
    // Even after the login's original ten-minute expiry, linkage is sufficient.
    await endEnterpriseSession(f.db, f.previousToken, f.browserToken, '2026-10-16T12:11:00.000Z');
  } finally { f.sql.close(); }
});

test('simultaneous finalizations produce one session, and concurrent logout leaves no usable issued session', async () => {
  const f = await fixture();
  const race = await fixture();
  try {
    await f.consume();
    const results = await Promise.all(Array.from({ length: 8 }, () => f.finish()));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(count(f.sql), 2);
    await race.consume();
    await Promise.all([race.finish(), endEnterpriseSession(race.db, race.previousToken, race.browserToken, now)]);
    assert.equal(race.sql.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL').get()!.n, 0);
    assert.ok(row(race.sql).cancelled_at);
  } finally { f.sql.close(); race.sql.close(); }
});

test('unconsumed, expired, future-consumed, mismatched and malformed contexts cannot issue or rotate a session', async () => {
  const f = await fixture();
  const future = await fixture();
  try {
    assert.equal(await f.finish(), null);
    assert.equal(oldRevoked(f.sql), null);
    await f.consume();
    for (const input of [
      { ...f.input, provider: 'entra' as const }, { ...f.input, browserToken: generateOpaqueToken() },
      { ...f.input, state: generateOpaqueToken() }, { ...f.input, state: 'short' },
      { ...f.input, browserToken: 'not-a-token' }, { ...f.input, identity: { ...identity, subject: 'x'.repeat(256) } },
      { ...f.input, identity: { ...identity, issuer: 'http://issuer.invalid' } },
    ]) assert.equal(await finalizeVerifiedLoginSession(f.db, input, now), null);
    assert.equal(await f.finish('2026-10-16T12:10:00.000Z'), null);
    await assert.rejects(f.finish('2026-02-30T12:00:00.000Z'));
    assert.equal(oldRevoked(f.sql), null);
    assert.equal(count(f.sql), 1);
    await future.consume(later);
    assert.equal(await future.finish(now), null);
  } finally { f.sql.close(); future.sql.close(); }
});

test('unknown identity, revoked membership and suspended organization do not create or rotate sessions', async () => {
  for (const mutation of [
    (sql: DatabaseSync) => sql.exec('DELETE FROM external_identities'),
    (sql: DatabaseSync) => sql.exec("UPDATE memberships SET status = 'revoked'"),
    (sql: DatabaseSync) => sql.exec("UPDATE organizations SET status = 'suspended'"),
  ]) {
    const f = await fixture();
    try {
      await f.consume();
      mutation(f.sql);
      assert.equal(await f.finish(), null);
      assert.equal(oldRevoked(f.sql), null);
      assert.equal(count(f.sql), 1);
      assert.equal(row(f.sql).session_id, null);
    } finally { f.sql.close(); }
  }
});

test('failed linkage rolls back issuance and rotation; failed logout rolls back transaction cancellation', async () => {
  const f = await fixture();
  try {
    await f.consume();
    f.sql.exec(`CREATE TRIGGER fail_link BEFORE UPDATE OF session_id ON login_transactions
      WHEN NEW.session_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`);
    await assert.rejects(f.finish(), /synthetic failure/);
    assert.equal(count(f.sql), 1);
    assert.equal(oldRevoked(f.sql), null);
    assert.equal(row(f.sql).session_id, null);
    assert.notEqual(row(f.sql).encrypted_payload, 'A'.repeat(32));
    f.sql.exec('DROP TRIGGER fail_link');
    f.sql.exec(`CREATE TRIGGER fail_revoke BEFORE UPDATE OF revoked_at ON sessions
      BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`);
    await assert.rejects(endEnterpriseSession(f.db, f.previousToken, f.browserToken, now), /synthetic failure/);
    assert.equal(row(f.sql).cancelled_at, null);
    assert.notEqual(row(f.sql).encrypted_payload, 'A'.repeat(32));
    assert.equal(oldRevoked(f.sql), null);
  } finally { f.sql.close(); }
});

test('logout before consumption erases pending material, while another browser and its session remain separate', async () => {
  const f = await fixture();
  try {
    const before = row(f.sql).encrypted_payload;
    await endEnterpriseSession(f.db, null, generateOpaqueToken(), now);
    assert.equal(row(f.sql).cancelled_at, null);
    assert.equal(row(f.sql).encrypted_payload, before);
    assert.equal(oldRevoked(f.sql), null);
    await endEnterpriseSession(f.db, null, f.browserToken, now);
    assert.equal(row(f.sql).cancelled_at, now);
    assert.equal(row(f.sql).encrypted_payload, 'A'.repeat(32));
    assert.equal(await f.consume(), null);
    assert.equal(await f.finish(), null);
    assert.equal(oldRevoked(f.sql), null);
    await endEnterpriseSession(f.db, f.previousToken, null, now);
    assert.equal(oldRevoked(f.sql), now);
  } finally { f.sql.close(); }
});

test('bounded cleanup retains live session links beyond login expiry and late logout revokes them', async () => {
  const f = await fixture();
  const expiredSession = await fixture();
  try {
    await f.consume();
    await f.finish();
    assert.equal(await cleanupExpiredLoginSessions(f.db, '2026-10-16T12:11:00.000Z'), 0);
    assert.equal(row(f.sql).encrypted_payload, 'A'.repeat(32));
    await endEnterpriseSession(f.db, f.previousToken, f.browserToken, '2026-10-16T12:11:00.000Z');
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL').get()!.n, 0);
    assert.equal(await cleanupExpiredLoginSessions(f.db, '2026-10-16T12:11:00.000Z', 1), 1);
    await expiredSession.consume();
    await expiredSession.finish();
    assert.equal(await cleanupExpiredLoginSessions(expiredSession.db, '2026-10-16T20:00:01.000Z'), 1);
    for (const limit of [0, 501, 1.5]) await assert.rejects(cleanupExpiredLoginSessions(f.db, now, limit));
  } finally { f.sql.close(); expiredSession.sql.close(); }
});

test('malformed logout tokens have no effect and valid token-only logout remains available', async () => {
  const f = await fixture();
  try {
    await endEnterpriseSession(f.db, 'A'.repeat(42) + 'B', f.browserToken + '=', now);
    assert.equal(oldRevoked(f.sql), null);
    assert.equal(row(f.sql).cancelled_at, null);
    await assert.rejects(endEnterpriseSession(f.db, f.previousToken, null, 'invalid'));
    await endEnterpriseSession(f.db, f.previousToken, null, now);
    assert.equal(oldRevoked(f.sql), now);
  } finally { f.sql.close(); }
});
