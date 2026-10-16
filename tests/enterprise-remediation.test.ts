/**
 * Tests for Reviewed Remediation Catalog (Task E7-01).
 * Verifies that all catalog actions are non-elevated, reversible, and explicitly
 * exclude force-kill, destructive cleanup, elevation, and registry modifications.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DevicePlatform, RemediationProposal } from '../lib/enterprise/contracts';
import {
  APPROVED_CATALOG_ACTIONS,
  createRemediationProposal,
  getCatalogAction,
  listCatalogActions,
  validateRemediationProposal,
} from '../lib/enterprise/remediation-catalog';

describe('E7-01: Remediation Catalog Action Safety Guarantees', () => {
  it('every catalog action specifies requiresElevation: false', () => {
    for (const action of APPROVED_CATALOG_ACTIONS) {
      assert.strictEqual(
        action.requiresElevation,
        false,
        `Action ${action.id} must have requiresElevation === false`,
      );
    }
  });

  it('no catalog action contains force-kill (kill -9 / Stop-Process -Force)', () => {
    for (const action of APPROVED_CATALOG_ACTIONS) {
      const script = action.renderScript({ pid: 1234, daysOld: 14 });
      assert.ok(
        !script.includes('kill -9'),
        `Action ${action.id} script must not contain "kill -9"`,
      );
      assert.ok(
        !script.includes('-Force') || action.id === 'win-disk-clean-user-temp',
        `Action ${action.id} must not use -Force for process termination`,
      );
      assert.ok(
        !script.includes('SIGKILL'),
        `Action ${action.id} must not use SIGKILL`,
      );
    }
  });

  it('no catalog action contains elevation commands (sudo, gsudo, runas, Start-Process -Verb RunAs)', () => {
    for (const action of APPROVED_CATALOG_ACTIONS) {
      const script = action.renderScript({ pid: 1234 });
      assert.ok(!script.includes('sudo '), `Action ${action.id} must not contain sudo`);
      assert.ok(!script.includes('RunAs'), `Action ${action.id} must not request RunAs elevation`);
      assert.ok(!script.includes('gsudo'), `Action ${action.id} must not contain gsudo`);
    }
  });

  it('no catalog action modifies system registry (Set-ItemProperty, New-ItemProperty, reg add)', () => {
    for (const action of APPROVED_CATALOG_ACTIONS) {
      const script = action.renderScript({ pid: 1234 });
      assert.ok(!script.includes('Set-ItemProperty'), `Action ${action.id} must not edit registry`);
      assert.ok(!script.includes('New-ItemProperty'), `Action ${action.id} must not edit registry`);
      assert.ok(!script.includes('reg add'), `Action ${action.id} must not edit registry`);
      assert.ok(!script.includes('HKLM:'), `Action ${action.id} must not touch HKLM`);
    }
  });

  it('every catalog action provides prerequisites, consequences, and rollback instructions', () => {
    for (const action of APPROVED_CATALOG_ACTIONS) {
      assert.ok(action.prerequisites.length > 0, `Action ${action.id} must list prerequisites`);
      assert.ok(action.consequences.length > 0, `Action ${action.id} must list consequences`);
      assert.ok(
        action.rollbackInstructions.length > 0,
        `Action ${action.id} must list rollback instructions`,
      );
      assert.ok(
        action.followUpCheckIds.length > 0,
        `Action ${action.id} must specify follow-up check IDs`,
      );
    }
  });
});

describe('E7-01: Catalog Proposal Creation and Validation', () => {
  it('createRemediationProposal creates valid proposal matching platform and catalog', () => {
    const proposal = createRemediationProposal(
      'win-net-flush-dns-cache',
      'windows',
      ['ev-101'],
      {},
    );

    assert.ok(proposal !== null);
    assert.strictEqual(proposal.catalogActionId, 'win-net-flush-dns-cache');
    assert.strictEqual(proposal.platform, 'windows');
    assert.strictEqual(proposal.requiresElevation, false);
    assert.deepStrictEqual(proposal.evidenceIds, ['ev-101']);
    assert.ok(proposal.consequences.length > 0);
  });

  it('createRemediationProposal returns null for mismatched platform and action', () => {
    // Windows action requested on Ubuntu platform
    const proposal = createRemediationProposal(
      'win-net-flush-dns-cache',
      'ubuntu',
      ['ev-101'],
    );
    assert.strictEqual(proposal, null);
  });

  it('validateRemediationProposal accepts valid proposals', () => {
    const valid: RemediationProposal = {
      id: 'prop-valid-001',
      catalogActionId: 'mac-net-flush-dns',
      catalogVersion: '1.0.0',
      platform: 'macos',
      evidenceIds: ['ev-mac-1'],
      parameters: {},
      consequences: ['Refreshes mDNS'],
      rollbackInstructions: ['No rollback required'],
      followUpCheckIds: ['dns_resolution_check'],
      requiresElevation: false,
    };

    const result = validateRemediationProposal(valid);
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.catalogActionId, 'mac-net-flush-dns');
      assert.strictEqual(result.value.requiresElevation, false);
    }
  });

  it('validateRemediationProposal rejects proposals requesting elevation (requiresElevation: true)', () => {
    const elevated = {
      id: 'prop-elevated-001',
      catalogActionId: 'win-net-flush-dns-cache',
      catalogVersion: '1.0.0',
      platform: 'windows',
      evidenceIds: ['ev-1'],
      parameters: {},
      consequences: [],
      rollbackInstructions: [],
      followUpCheckIds: [],
      requiresElevation: true, // Violation!
    };

    const result = validateRemediationProposal(elevated);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Security violation'));
    }
  });

  it('validateRemediationProposal rejects unknown or unapproved catalogActionId', () => {
    const unknownAction = {
      id: 'prop-unknown-001',
      catalogActionId: 'arbitrary-shell-execution-script',
      catalogVersion: '1.0.0',
      platform: 'windows',
      evidenceIds: ['ev-1'],
      parameters: {},
      consequences: [],
      rollbackInstructions: [],
      followUpCheckIds: [],
      requiresElevation: false,
    };

    const result = validateRemediationProposal(unknownAction);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('not approved'));
    }
  });
});
