// Disposable structural SQLite checks only. Active membership, organization,
// role authorization and session validity must also be enforced by the server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const migration = readFileSync('enterprise/migrations/0001_foundation.sql', 'utf8');
const now = '2026-10-15T12:00:00.000Z';
const later = '2026-10-15T13:00:00.000Z';
const caseId = '00000000-0000-4000-8000-000000000001';
const otherCaseId = '00000000-0000-4000-8000-000000000002';
const tables = ['organizations', 'enterprise_users', 'external_identities', 'memberships', 'sessions',
  'enterprise_cases', 'audit_events', 'enterprise_create_requests'];
function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(migration);
  return db;
}
function insert(db: DatabaseSync, table: string, fields: Record<string, string | null>) {
  assert.ok(tables.includes(table));
  const names = Object.keys(fields);
  db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...Object.values(fields));
}
function seed(db: DatabaseSync) {
  for (const suffix of ['a', 'b']) {
    insert(db, 'organizations', { id: `org-${suffix}`, name: `Synthetic ${suffix}`, status: 'active' });
    insert(db, 'enterprise_users', { id: `user-${suffix}` });
    insert(db, 'memberships', { org_id: `org-${suffix}`, user_id: `user-${suffix}`, role: 'requester', status: 'active' });
  }
}
function caseRow(changes: Record<string, string | null> = {}) {
  return { id: caseId, org_id: 'org-a', requester_id: 'user-a', title: 'Synthetic case',
    description: 'Synthetic schema fixture only.', platform: 'windows', status: 'open',
    device_authorized_at: now, consent_at: now, created_at: now, updated_at: now, ...changes };
}
function requestRow(changes: Record<string, string | null> = {}) {
  return { org_id: 'org-a', requester_id: 'user-a', key_hash: 'a'.repeat(64), payload_hash: 'b'.repeat(64),
    case_id: caseId, created_at: now, ...changes };
}

test('fresh enterprise lineage is empty and accepts explicit all-field inserts for every table', () => {
  const db = fresh();
  try {
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name), [...tables].sort());
    for (const table of tables) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0);
    seed(db);
    insert(db, 'external_identities', { user_id: 'user-a', issuer: 'https://identity.example.invalid', subject: 'synthetic-subject' });
    insert(db, 'sessions', { id: 'session-a', token_hash: 'c'.repeat(64), user_id: 'user-a', created_at: now, expires_at: later, revoked_at: null });
    insert(db, 'enterprise_cases', caseRow());
    insert(db, 'audit_events', { id: 'audit-a', org_id: 'org-a', actor_id: 'user-a', action: 'case.created', case_id: caseId, created_at: now });
    insert(db, 'enterprise_create_requests', requestRow());
    for (const table of tables) assert.ok(Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n) >= 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
  } finally { db.close(); }
});

test('structural foreign keys reject missing principals and cross-organization references', () => {
  const db = fresh();
  try {
    seed(db);
    assert.throws(() => insert(db, 'enterprise_cases', caseRow({ requester_id: 'user-b' })), /FOREIGN KEY/);
    assert.throws(() => insert(db, 'memberships', { org_id: 'missing', user_id: 'user-a', role: 'technician', status: 'active' }), /FOREIGN KEY/);
    assert.throws(() => insert(db, 'external_identities', { user_id: 'missing', issuer: 'issuer', subject: 'subject' }), /FOREIGN KEY/);
    assert.throws(() => insert(db, 'sessions', { id: 'missing-user-session', token_hash: 'c'.repeat(64), user_id: 'missing', created_at: now, expires_at: later, revoked_at: null }), /FOREIGN KEY/);
    insert(db, 'enterprise_cases', caseRow());
    assert.throws(() => insert(db, 'audit_events', { id: 'wrong-actor', org_id: 'org-a', actor_id: 'user-b', action: 'case.created', case_id: caseId, created_at: now }), /FOREIGN KEY/);
    assert.throws(() => insert(db, 'audit_events', { id: 'wrong-case', org_id: 'org-b', actor_id: 'user-b', action: 'case.created', case_id: caseId, created_at: now }), /FOREIGN KEY/);
    assert.throws(() => insert(db, 'enterprise_create_requests', requestRow({ requester_id: 'user-b' })), /FOREIGN KEY/);
  } finally { db.close(); }
});

test('role, status and platform constraints reject unsupported values', () => {
  const db = fresh();
  try {
    seed(db);
    for (const role of ['support', 'owner', '']) assert.throws(() => db.prepare('UPDATE memberships SET role = ?').run(role), /CHECK/);
    for (const status of ['disabled', '']) assert.throws(() => db.prepare('UPDATE memberships SET status = ?').run(status), /CHECK/);
    assert.throws(() => db.prepare("UPDATE organizations SET status = 'deleted'").run(), /CHECK/);
    for (const platform of ['linux', 'windows11', '']) assert.throws(() => insert(db, 'enterprise_cases', caseRow({ platform })), /CHECK/);
    for (const status of ['in_progress', 'repaired', '']) assert.throws(() => insert(db, 'enterprise_cases', caseRow({ status })), /CHECK/);
    for (const [index, platform] of ['windows', 'macos', 'ubuntu'].entries()) {
      insert(db, 'enterprise_cases', caseRow({ id: `00000000-0000-4000-8000-00000000000${index + 3}`, platform }));
    }
  } finally { db.close(); }
});

test('bounded text, canonical timestamp shape and token hashes reject malformed storage', () => {
  const db = fresh();
  try {
    seed(db);
    for (const name of [' ', 'x'.repeat(161)]) assert.throws(() => db.prepare('UPDATE organizations SET name = ?').run(name), /CHECK/);
    for (const title of ['  ', 'ab', 'x'.repeat(121)]) assert.throws(() => insert(db, 'enterprise_cases', caseRow({ title })), /CHECK/);
    for (const description of ['short', 'x'.repeat(4001)]) assert.throws(() => insert(db, 'enterprise_cases', caseRow({ description })), /CHECK/);
    for (const field of ['created_at', 'updated_at', 'device_authorized_at', 'consent_at']) {
      assert.throws(() => insert(db, 'enterprise_cases', caseRow({ [field]: 'not-a-timestamp' })), /CHECK/);
    }
    assert.throws(() => insert(db, 'enterprise_cases', caseRow({ updated_at: '2026-10-14T12:00:00.000Z' })), /CHECK/);
    for (const token_hash of ['c'.repeat(63), 'G'.repeat(64), 'C'.repeat(64)]) {
      assert.throws(() => insert(db, 'sessions', { id: 'session-invalid', token_hash, user_id: 'user-a', created_at: now, expires_at: later, revoked_at: null }), /CHECK/);
    }
    assert.throws(() => insert(db, 'sessions', { id: 'session-expired', token_hash: 'c'.repeat(64), user_id: 'user-a', created_at: now, expires_at: now, revoked_at: null }), /CHECK/);
    assert.throws(() => insert(db, 'external_identities', { user_id: 'user-a', issuer: 'x'.repeat(513), subject: 'subject' }), /CHECK/);
    assert.throws(() => insert(db, 'enterprise_create_requests', requestRow({ key_hash: 'not-a-hash' })), /CHECK/);
    assert.throws(() => insert(db, 'enterprise_create_requests', requestRow({ payload_hash: 'G'.repeat(64) })), /CHECK/);
    assert.throws(() => insert(db, 'enterprise_create_requests', requestRow({ case_id: 'short' })), /CHECK/);
  } finally { db.close(); }
});

test('identity, session and membership uniqueness prevents ambiguous bindings', () => {
  const db = fresh();
  try {
    seed(db);
    const identity = { user_id: 'user-a', issuer: 'https://issuer.example.invalid', subject: 'subject' };
    insert(db, 'external_identities', identity);
    assert.throws(() => insert(db, 'external_identities', { ...identity, user_id: 'user-b' }), /UNIQUE/);
    insert(db, 'sessions', { id: 'session-a', token_hash: 'c'.repeat(64), user_id: 'user-a', created_at: now, expires_at: later, revoked_at: null });
    assert.throws(() => insert(db, 'sessions', { id: 'session-b', token_hash: 'c'.repeat(64), user_id: 'user-b', created_at: now, expires_at: later, revoked_at: null }), /UNIQUE/);
    assert.throws(() => insert(db, 'memberships', { org_id: 'org-a', user_id: 'user-a', role: 'administrator', status: 'active' }), /UNIQUE/);
  } finally { db.close(); }
});

test('retry reservation survives deletion and keys remain scoped to organization and requester', () => {
  const db = fresh();
  try {
    seed(db);
    insert(db, 'enterprise_cases', caseRow());
    insert(db, 'enterprise_create_requests', requestRow());
    db.prepare('DELETE FROM enterprise_cases WHERE id = ?').run(caseId);
    assert.equal(db.prepare('SELECT case_id FROM enterprise_create_requests').get()!.case_id, caseId);
    assert.throws(() => insert(db, 'enterprise_create_requests', requestRow({ case_id: otherCaseId })), /UNIQUE/);
    insert(db, 'enterprise_create_requests', requestRow({ org_id: 'org-b', requester_id: 'user-b', case_id: otherCaseId }));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enterprise_create_requests').get()!.n, 2);
  } finally { db.close(); }
});

test('structural membership does not grant active authorization: the server must check policy', () => {
  const db = fresh();
  try {
    seed(db);
    db.prepare("UPDATE memberships SET status = 'revoked' WHERE org_id = 'org-a'").run();
    db.prepare("UPDATE organizations SET status = 'suspended' WHERE id = 'org-a'").run();
    // This intentionally succeeds structurally. It is NOT permission to call
    // the application; the repository must independently deny this principal.
    insert(db, 'enterprise_cases', caseRow());
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enterprise_cases').get()!.n, 1);
  } finally { db.close(); }
});
