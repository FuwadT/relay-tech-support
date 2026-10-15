// Exercise the installed D1 adapter's object-row batch mapping, not just SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { createIdempotentCase } from '../lib/idempotent-create';
import { validateIntake } from '../lib/validation';

test('D1 object-row replay retains current case fields after updates and recognizes deletion', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
    for (const entry of journal.entries) sqlite.exec(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8'));
    type Statement = { query: string; params: SQLInputValue[] };
    const client = {
      prepare(query: string) {
        return { bind: (...params: SQLInputValue[]): Statement => ({ query, params }) };
      },
      async batch(statements: Statement[]) {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const results = statements.map(statement => ({
            // D1 batch returns objects keyed by result column names, unlike raw().
            results: sqlite.prepare(statement.query).all(...statement.params), success: true,
          }));
          sqlite.exec('COMMIT');
          return results;
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      },
    };
    const db = drizzle(client as never, { schema });
    const input = validateIntake({ title: 'Synthetic replay fixture',
      description: 'Synthetic D1 adapter test only.', deviceName: 'Fixture device',
      category: 'performance', os: 'windows11', ownership: 'personal', consent: true });
    const originalTime = '2026-10-15T12:00:00.000Z';
    const row: typeof schema.cases.$inferSelect = {
      ...input, os: 'windows11', ownership: 'personal', id: 'winning-case', userId: 'synthetic-owner', status: 'open',
      answers: {}, measurements: {}, ruleVersion: 'fixture', analysisSnapshot: null,
      notes: '', internalNotes: '', assignedTo: null, escalatedAt: null,
      consentAt: originalTime, createdAt: originalTime, updatedAt: originalTime, verifiedAt: null,
    };
    const key = '4a84ef49-0bdf-4421-8265-d696677685ec';
    const initial = await createIdempotentCase(db, row, key, input);
    assert.equal(initial.outcome, 'saved');
    if (initial.outcome !== 'saved') throw new Error('Expected saved fixture');
    assert.deepEqual(initial.row, row);
    const changedTime = '2026-10-15T13:10:00.000Z';
    const answers = { scope: 'whole_device', resources: 'normal' };
    sqlite.prepare('UPDATE support_cases SET updated_at = ?, notes = ?, answers = ? WHERE id = ?')
      .run(changedTime, 'Saved progress', JSON.stringify(answers), row.id);
    const replay = await createIdempotentCase(db, { ...row, id: 'losing-retry' }, key, input);
    assert.equal(replay.outcome, 'saved');
    if (replay.outcome !== 'saved') throw new Error('Expected replay fixture');
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.row, { ...row, updatedAt: changedTime, notes: 'Saved progress', answers });
    sqlite.prepare('DELETE FROM support_cases WHERE id = ?').run(row.id);
    assert.deepEqual(await createIdempotentCase(db, { ...row, id: 'deleted-retry' }, key, input), { outcome: 'deleted' });
  } finally { sqlite.close(); }
});
