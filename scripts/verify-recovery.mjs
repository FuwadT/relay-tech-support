// Disposable SQLite rehearsal only. Never opens or replaces an application DB.
import assert from 'node:assert/strict';
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('.sites-runtime', `recovery-${crypto.randomUUID()}`);
await mkdir(directory, { recursive: true });
const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
const source = new DatabaseSync(path.join(directory, 'source.sqlite'));
const open = [source];
try {
  let priorId = '00000000-0000-0000-0000-000000000000';
  for (const [index, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, index, 'Migration journal indices must be consecutive');
    const snapshot = JSON.parse(await readFile(`drizzle/meta/${String(index).padStart(4, '0')}_snapshot.json`, 'utf8'));
    assert.equal(snapshot.prevId, priorId, 'Migration snapshots must form a chain');
    priorId = snapshot.id;
    source.exec(await readFile(`drizzle/${entry.tag}.sql`, 'utf8'));
    const actualTables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name).sort();
    assert.deepEqual(actualTables, Object.keys(snapshot.tables).sort(), `Migration ${entry.tag} table set differs from its snapshot`);
    for (const [tableName, table] of Object.entries(snapshot.tables)) {
      const quotedName = `"${tableName.replaceAll('"', '""')}"`;
      const columns = source.prepare(`PRAGMA table_info(${quotedName})`).all();
      const expected = table.columns;
      const compositeKeys = Object.values(table.compositePrimaryKeys ?? {}).flatMap(key => key.columns);
      assert.deepEqual(columns.map(column => column.name).sort(), Object.keys(expected).sort(), `Migration ${entry.tag}/${tableName} differs from its snapshot`);
      for (const column of columns) {
        assert.equal(column.type.toLowerCase(), expected[column.name].type.toLowerCase());
        assert.equal(Boolean(column.notnull), expected[column.name].notNull, `Nullability mismatch: ${tableName}.${column.name}`);
        assert.equal(Boolean(column.pk), expected[column.name].primaryKey || compositeKeys.includes(column.name), `Primary key mismatch: ${tableName}.${column.name}`);
      }
    }
    console.log(`Applied and verified ${entry.tag}`);
  }

  const timestamp = new Date().toISOString();
  const id = 'synthetic-recovery-case';
  source.prepare(`INSERT INTO support_cases
    (id,user_id,title,description,device_name,category,os,ownership,answers,consent,consent_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, 'synthetic-owner', 'Recovery fixture', 'No real customer data', 'Fixture',
      'network', 'windows11', 'personal', '{}', 1, timestamp, timestamp, timestamp,
    );
  source.prepare('UPDATE support_cases SET notes = ?, measurements = ?, analysis_snapshot = ? WHERE id = ?')
    .run('Saved before backup', '{"baseline":{"download_mbps":20}}', '{"ruleVersion":"fixture"}', id);
  const expected = { ...source.prepare('SELECT * FROM support_cases WHERE id = ?').get(id) };
  // Retry reservations deliberately survive case deletion. A backup must retain
  // this minimal tombstone too, or a restored service can recreate deleted cases.
  const hasReservations = Boolean(source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='case_create_requests'").get());
  let expectedReservation;
  if (hasReservations) {
    source.prepare('INSERT INTO case_create_requests (owner_id,key_hash,payload_hash,case_id,created_at) VALUES (?,?,?,?,?)')
      .run('synthetic-owner', '1'.repeat(64), '2'.repeat(64), id, timestamp);
    expectedReservation = { ...source.prepare('SELECT * FROM case_create_requests WHERE case_id = ?').get(id) };
  }
  const backupPath = path.join(directory, 'before-deletion.sqlite');
  await backup(source, backupPath);
  source.prepare('UPDATE support_cases SET notes = ? WHERE id = ?').run('Later change', id);
  const restored = new DatabaseSync(backupPath, { readOnly: true });
  open.push(restored);
  assert.deepEqual({ ...restored.prepare('SELECT * FROM support_cases WHERE id = ?').get(id) }, expected);
  if (hasReservations) {
    assert.deepEqual({ ...restored.prepare('SELECT * FROM case_create_requests WHERE case_id = ?').get(id) }, expectedReservation);
  }
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  const indexColumns = restored.prepare('PRAGMA index_info(support_cases_owner_updated)').all().map(row => row.name);
  assert.deepEqual(indexColumns, ['user_id', 'updated_at']);

  // Demonstrate the retention limitation rather than promising an older backup
  // can preserve later deletions. A production restore needs a deletion ledger.
  source.prepare('DELETE FROM support_cases WHERE id = ?').run(id);
  assert.equal(source.prepare('SELECT COUNT(*) AS count FROM support_cases').get().count, 0);
  assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM support_cases').get().count, 1);
  await backup(source, path.join(directory, 'after-deletion.sqlite'));
  const latest = new DatabaseSync(path.join(directory, 'after-deletion.sqlite'), { readOnly: true });
  open.push(latest);
  assert.equal(latest.prepare('SELECT COUNT(*) AS count FROM support_cases').get().count, 0);
  if (hasReservations) {
    assert.deepEqual({ ...latest.prepare('SELECT * FROM case_create_requests WHERE case_id = ?').get(id) }, expectedReservation);
    console.log('PASS: retry reservation survives case deletion and post-deletion backup.');
  }
  console.log('PASS: migration metadata, backup content, integrity, owner index and post-deletion backup checked.');
  console.log('Confirmed limitation: a pre-deletion backup contains the deleted fixture; production restore needs deletion replay.');
  console.log(`Synthetic evidence retained locally: ${directory}`);
} finally {
  for (const database of open.reverse()) database.close();
}
