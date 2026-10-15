// Executes the production Drizzle batch SQL against disposable SQLite. This
// verifies SQL guards and rollback, not hosted D1 scheduling or authentication.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { createRequestBatch } from '../lib/idempotent-create';

const sqlBuilder = drizzle({} as never, { schema });
const timestamp = '2026-10-15T12:00:00.000Z';
function candidate(id: string, userId = 'synthetic-owner'): typeof schema.cases.$inferSelect {
  return {
    id, userId, title: 'Atomicity fixture', description: 'Synthetic SQLite test only',
    deviceName: 'Fixture', category: 'network', os: 'windows11', ownership: 'personal',
    status: 'open', answers: {}, measurements: {}, ruleVersion: 'fixture', analysisSnapshot: null,
    notes: '', internalNotes: '', assignedTo: null, escalatedAt: null,
    consent: true, consentAt: timestamp, createdAt: timestamp, updatedAt: timestamp, verifiedAt: null,
  };
}
function database() {
  const db = new DatabaseSync(':memory:');
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  for (const entry of journal.entries) db.exec(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
  return db;
}
function batch(db: DatabaseSync, id: string, keyHash = 'a'.repeat(64), payloadHash = 'b'.repeat(64), owner?: string) {
  const operations = createRequestBatch(sqlBuilder, candidate(id, owner), { keyHash, payloadHash });
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const operation of operations) {
      const { sql, params } = operation.toSQL();
      db.prepare(sql).all(...params as (string | number | null)[]);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function count(db: DatabaseSync, table: 'support_cases' | 'case_create_requests') {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count;
}

test('failed case insertion rolls back its reservation and the same key can retry', () => {
  const db = database();
  try {
    db.exec("CREATE TEMP TRIGGER fail_case BEFORE INSERT ON support_cases BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;");
    assert.throws(() => batch(db, 'first-fails'), /synthetic write failure/);
    assert.equal(count(db, 'support_cases'), 0);
    assert.equal(count(db, 'case_create_requests'), 0, 'A failed batch must not strand its key');
    db.exec('DROP TRIGGER fail_case');
    batch(db, 'successful-retry');
    assert.equal(count(db, 'support_cases'), 1);
    assert.equal(count(db, 'case_create_requests'), 1);
    assert.equal(db.prepare('SELECT case_id FROM case_create_requests').get()!.case_id, 'successful-retry');
  } finally { db.close(); }
});

test('production SQL preserves the winning case and deletion tombstone across later attempts', () => {
  const db = database();
  try {
    batch(db, 'winner');
    batch(db, 'loser');
    batch(db, 'changed-payload', 'a'.repeat(64), 'c'.repeat(64));
    assert.equal(count(db, 'support_cases'), 1);
    assert.equal(count(db, 'case_create_requests'), 1);
    assert.equal(db.prepare('SELECT id FROM support_cases').get()!.id, 'winner');
    assert.equal(db.prepare('SELECT payload_hash FROM case_create_requests').get()!.payload_hash, 'b'.repeat(64));
    db.prepare('DELETE FROM support_cases WHERE id = ?').run('winner');
    batch(db, 'must-not-resurrect');
    assert.equal(count(db, 'support_cases'), 0);
    assert.equal(count(db, 'case_create_requests'), 1);
    batch(db, 'other-owner', 'a'.repeat(64), 'b'.repeat(64), 'synthetic-other');
    assert.equal(count(db, 'support_cases'), 1);
    assert.equal(count(db, 'case_create_requests'), 2);
    assert.equal(db.prepare('SELECT user_id FROM support_cases').get()!.user_id, 'synthetic-other');
  } finally { db.close(); }
});
