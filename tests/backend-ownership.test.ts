import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { apiError, ownedCase, publicCase } from '../lib/case-store';

test('owner condition binds both the requested case and authenticated user', () => {
  const sql = new SQLiteSyncDialect().sqlToQuery(ownedCase('case-123', 'owner-abc')!);
  assert.match(sql.sql, /"id" = \?/);
  assert.match(sql.sql, /"user_id" = \?/);
  assert.match(sql.sql, / and /);
  assert.deepEqual(sql.params, ['case-123', 'owner-abc']);
});

test('public case response does not expose owner or consent storage metadata, and strips internalNotes for customers', () => {
  const sampleRow = {
    id: '1',
    userId: 'private',
    title: 'test',
    description: 'description',
    deviceName: 'pc',
    category: 'network' as const,
    os: 'windows11' as const,
    ownership: 'personal' as const,
    status: 'open' as const,
    answers: {},
    measurements: {},
    analysisSnapshot: null,
    ruleVersion: '1.0.0',
    notes: '',
    internalNotes: 'Secret internal diagnostic investigation notes',
    assignedTo: 'tech-smith',
    escalatedAt: null,
    consent: true,
    consentAt: 'now',
    createdAt: 'now',
    updatedAt: 'now',
    verifiedAt: null,
  };

  const customerView = publicCase(sampleRow, 'customer');
  assert.equal('userId' in customerView, false);
  assert.equal('consentAt' in customerView, false);
  assert.equal('consent' in customerView, false);
  assert.equal('internalNotes' in customerView, false);
  assert.equal(customerView.assignedTo, 'tech-smith');

  const supportView = publicCase(sampleRow, 'support');
  assert.equal(supportView.internalNotes, 'Secret internal diagnostic investigation notes');
  assert.equal(supportView.assignedTo, 'tech-smith');

  const adminView = publicCase(sampleRow, 'admin');
  assert.equal(adminView.internalNotes, 'Secret internal diagnostic investigation notes');
});

test('failure reference correlates logs without leaking database parameters', async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (value: unknown) => logs.push(String(value));
  try {
    const response = apiError(new Error('SQL failed: private customer notes and email'));
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: string; requestId: string };
    assert.equal(JSON.parse(logs[0]).requestId, body.requestId);
    assert.match(body.error, new RegExp(body.requestId));
    assert.doesNotMatch(logs.join(' ') + JSON.stringify(body), /private customer|SQL failed|email/);
  } finally {
    console.error = original;
  }
});
