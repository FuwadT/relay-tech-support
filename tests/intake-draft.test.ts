import test from 'node:test';
import assert from 'node:assert/strict';
import type { IntakeInput } from '../lib/contracts';
import { intakeDraftKey, makeIntakeSubmission, parseIntakeDraft, type StoredIntakeDraft } from '../lib/intake-draft';

const key = 'fa0cf310-6b8f-4268-bb82-87b6962fffee';
const form: IntakeInput = { title: ' Synthetic save attempt ', description: 'Synthetic intake draft only.',
  deviceName: 'Fixture', category: 'network', os: 'windows11', ownership: 'personal', consent: true };
function draft(): StoredIntakeDraft {
  return { version: 1, ownerId: 'owner-A', form: { ...form }, submission: makeIntakeSubmission(form, key) };
}

test('serialized intake attempts preserve exact UUID and payload across reload', () => {
  const saved = draft();
  assert.deepEqual(parseIntakeDraft(JSON.stringify(saved), 'owner-A'), saved);
  assert.equal(saved.submission?.payload.title, form.title);
  assert.equal(makeIntakeSubmission(form, key.toUpperCase()).key, key);
  assert.match(makeIntakeSubmission(form).key, /^[0-9a-f-]{36}$/);
});

test('draft keys and restoration isolate owners', () => {
  assert.notEqual(intakeDraftKey('owner/A'), intakeDraftKey('owner%2FA'));
  assert.notEqual(intakeDraftKey('owner-A'), intakeDraftKey('owner-B'));
  assert.equal(parseIntakeDraft(JSON.stringify(draft()), 'owner-B'), null);
});

test('mutable form edits cannot mutate a submitted replay snapshot', () => {
  const editing = { ...form };
  const submission = makeIntakeSubmission(editing, key);
  editing.title = 'Changed title';
  assert.equal(submission.payload.title, form.title);
  assert.ok(Object.isFrozen(submission));
  assert.ok(Object.isFrozen(submission.payload));
  assert.throws(() => { submission.payload.title = 'Mutation'; }, TypeError);
  const persisted = { ...draft(), form: editing, submission };
  const restored = parseIntakeDraft(JSON.stringify(persisted), 'owner-A')!;
  assert.equal(restored.form.title, editing.title);
  assert.equal(restored.submission?.payload.title, form.title);
});

test('drafts retain incomplete and unsupported UI choices without accepting arbitrary fields', () => {
  const incomplete = { ...draft(), form: { ...form, title: '', description: '', deviceName: '',
    os: 'other', ownership: 'work', consent: false }, submission: null };
  assert.deepEqual(parseIntakeDraft(JSON.stringify(incomplete), 'owner-A'), incomplete);
  assert.equal(parseIntakeDraft(JSON.stringify({ ...incomplete, form: { ...form, internalNotes: 'Hidden' } }), 'owner-A'), null);
});

test('corrupt or incompatible attempts fail closed without silently dropping a replay key', () => {
  for (const value of [null, [], {}, { ...draft(), version: 2 }, { ...draft(), extra: true },
    { ...draft(), form: { ...form, title: {} } }, { ...draft(), form: { ...form, consent: 'true' } },
    { ...draft(), form: { ...form, category: 'other' } }, { ...draft(), form: { ...form, description: 'x'.repeat(2001) } },
    { ...draft(), submission: { key: 'invalid', payload: form } },
    { ...draft(), submission: { key, payload: { ...form, consent: false } } },
    { ...draft(), submission: { key, payload: { ...form, os: 'other' } } },
    { ...draft(), submission: { key, payload: form, hidden: true } }]) {
    assert.equal(parseIntakeDraft(JSON.stringify(value), 'owner-A'), null);
  }
  assert.equal(parseIntakeDraft(null, 'owner-A'), null);
  assert.equal(parseIntakeDraft('{broken', 'owner-A'), null);
  assert.equal(parseIntakeDraft('x'.repeat(24001), 'owner-A'), null);
});

test('submission creation rejects invalid UUIDs and unsupported intake', () => {
  for (const invalid of ['', 'relay-key-123', `${key},${key}`, ` ${key}`]) {
    assert.throws(() => makeIntakeSubmission(form, invalid), /UUID/);
  }
  assert.throws(() => makeIntakeSubmission({ ...form, consent: false }, key), /Consent/);
});

test('unavailable secure UUID generation gives a controlled error', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    assert.throws(() => makeIntakeSubmission(form), /cannot securely identify/);
    assert.equal(makeIntakeSubmission(form, key).key, key, 'A persisted retry needs no new UUID');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});
