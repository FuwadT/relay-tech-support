import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRole } from '../app/chatgpt-auth';
import { publicCase } from '../lib/case-store';
import {
  canAccessQueue,
  canEditSupportFields,
  canViewInternalNotes,
  hasPermission,
  ROLE_PERMISSIONS,
} from '../lib/contracts';
import { InputError, validatePatch, validateSupportPatch } from '../lib/validation';

test('S4-01 permissions matrix enforces customer and support role boundaries', () => {
  // Matrix integrity
  assert.ok(ROLE_PERMISSIONS.customer);
  assert.ok(ROLE_PERMISSIONS.support);
  assert.ok(ROLE_PERMISSIONS.admin);

  // Customer restrictions
  assert.equal(hasPermission('customer', 'view_queue'), false);
  assert.equal(hasPermission('customer', 'view_any_case'), false);
  assert.equal(hasPermission('customer', 'view_internal_notes'), false);
  assert.equal(hasPermission('customer', 'edit_internal_notes'), false);
  assert.equal(hasPermission('customer', 'assign_technician'), false);
  assert.equal(hasPermission('customer', 'delete_any_case'), false);
  assert.equal(canAccessQueue('customer'), false);
  assert.equal(canViewInternalNotes('customer'), false);
  assert.equal(canEditSupportFields('customer'), false);

  // Support operator permissions
  assert.equal(hasPermission('support', 'view_queue'), true);
  assert.equal(hasPermission('support', 'view_any_case'), true);
  assert.equal(hasPermission('support', 'view_internal_notes'), true);
  assert.equal(hasPermission('support', 'edit_internal_notes'), true);
  assert.equal(hasPermission('support', 'assign_technician'), true);
  // Support operators cannot delete customer cases
  assert.equal(hasPermission('support', 'delete_any_case'), false);
  assert.equal(canAccessQueue('support'), true);
  assert.equal(canViewInternalNotes('support'), true);
  assert.equal(canEditSupportFields('support'), true);

  // Admin permissions
  assert.equal(hasPermission('admin', 'view_queue'), true);
  assert.equal(hasPermission('admin', 'delete_any_case'), true);
});

test('S4-02 resolveRole enforces server-controlled grants and rejects client authority', () => {
  const original = process.env.RELAY_SUPPORT_EMAILS;
  try {
    // Unconfigured environment defaults strictly to empty allowlist
    delete process.env.RELAY_SUPPORT_EMAILS;
    assert.equal(resolveRole('support@relay.test'), 'customer');
    assert.equal(resolveRole('charlie@relay.support'), 'customer');

    // Configured environment grants staff role
    process.env.RELAY_SUPPORT_EMAILS = 'support@relay.test,charlie@relay.support';
    assert.equal(resolveRole('support@relay.test'), 'support');
    assert.equal(resolveRole('charlie@relay.support'), 'support');

    // Standard customer default
    assert.equal(resolveRole('customer@example.com'), 'customer');
    assert.equal(resolveRole('alice@relay.test'), 'customer');
    assert.equal(resolveRole('bob@relay.test'), 'customer');
    assert.equal(resolveRole('hacker@admin.com'), 'customer');
  } finally {
    if (original !== undefined) process.env.RELAY_SUPPORT_EMAILS = original;
    else delete process.env.RELAY_SUPPORT_EMAILS;
  }
});

test('S4-05 publicCase strips internalNotes strictly for customer role and exposes it for staff', () => {
  const row = {
    id: 'c-101',
    userId: 'cust-xyz',
    title: 'Wi-Fi connection drops',
    description: 'Drops every 10 minutes',
    deviceName: 'Laptop',
    category: 'network' as const,
    os: 'windows11' as const,
    ownership: 'personal' as const,
    status: 'in_progress' as const,
    answers: {},
    measurements: {},
    ruleVersion: '1.0.0',
    analysisSnapshot: null,
    notes: 'Customer note',
    internalNotes: 'Technician verified MTU mismatch on ISP gateway',
    assignedTo: 'operator-1',
    escalatedAt: '2026-10-15T00:00:00Z',
    consent: true,
    consentAt: '2026-10-15T00:00:00Z',
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
    verifiedAt: null,
  };

  const customerView = publicCase(row, 'customer');
  assert.equal('internalNotes' in customerView, false);
  assert.equal(customerView.internalNotes, undefined);
  assert.equal(customerView.assignedTo, 'operator-1');
  assert.equal(customerView.escalatedAt, '2026-10-15T00:00:00Z');

  const defaultView = publicCase(row); // default is customer
  assert.equal('internalNotes' in defaultView, false);

  const supportView = publicCase(row, 'support');
  assert.equal(supportView.internalNotes, 'Technician verified MTU mismatch on ISP gateway');
  assert.equal(supportView.assignedTo, 'operator-1');

  const adminView = publicCase(row, 'admin');
  assert.equal(adminView.internalNotes, 'Technician verified MTU mismatch on ISP gateway');
});

test('S4-03 / S4-05 validatePatch rejects customer attempts to modify internalNotes or assignedTo', () => {
  assert.throws(
    () => validatePatch({ internalNotes: 'Attempted hack' }, 'network'),
    (err: unknown) => err instanceof InputError && /cannot modify internal notes/i.test(err.message)
  );
  assert.throws(
    () => validatePatch({ assignedTo: 'me' }, 'network'),
    (err: unknown) => err instanceof InputError && /cannot modify internal notes/i.test(err.message)
  );
});

test('S4-01 CaseStatus supports open, in_progress, escalated, resolved, and closed', () => {
  for (const status of ['open', 'in_progress', 'escalated', 'resolved', 'closed']) {
    const res = validatePatch({ status }, 'network');
    assert.equal(res.status, status);
  }
  assert.throws(
    () => validatePatch({ status: 'cancelled' }, 'network'),
    (err: unknown) => err instanceof InputError && /unsupported status/i.test(err.message)
  );
});

test('S4-05 validateSupportPatch validates internalNotes, assignedTo, status, and notes for staff', () => {
  const valid = validateSupportPatch({
    internalNotes: 'Investigation in progress',
    assignedTo: 'support-agent-42',
    status: 'escalated',
    notes: 'Public note for customer',
  });
  assert.equal(valid.internalNotes, 'Investigation in progress');
  assert.equal(valid.assignedTo, 'support-agent-42');
  assert.equal(valid.status, 'escalated');
  assert.equal(valid.notes, 'Public note for customer');

  // Clearing assignment with null
  const clearedAssignment = validateSupportPatch({ assignedTo: null });
  assert.equal(clearedAssignment.assignedTo, null);

  // Rejects empty payload
  assert.throws(
    () => validateSupportPatch({}),
    (err: unknown) => err instanceof InputError && /provide internalnotes/i.test(err.message)
  );

  // Rejects unauthorized fields
  assert.throws(
    () => validateSupportPatch({ answers: {} }),
    (err: unknown) => err instanceof InputError && /unsupported field/i.test(err.message)
  );

  // Rejects oversized internal notes (>4000)
  assert.throws(
    () => validateSupportPatch({ internalNotes: 'a'.repeat(4001) }),
    (err: unknown) => err instanceof InputError && /internal notes must be/i.test(err.message)
  );

  // Rejects oversized assignedTo (>100)
  assert.throws(
    () => validateSupportPatch({ assignedTo: 'a'.repeat(101) }),
    (err: unknown) => err instanceof InputError && /assigned technician must be/i.test(err.message)
  );
});
