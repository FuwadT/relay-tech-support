/**
 * Parity and Deduplication Assertion Test for Relay Collector Scripts (Task E4-02/03/04).
 *
 * Asserts strict byte-for-byte parity between enterprise/collectors/* and public/collectors/*
 * ensuring canonical templates never drift apart.
 */

import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('Collector Scripts Single Source of Truth & Parity Invariant', () => {
  it('asserts byte-for-byte parity between enterprise and public macOS collectors', () => {
    const enterpriseMac = readFileSync('enterprise/collectors/macos.sh', 'utf8');
    const publicMac = readFileSync('public/collectors/macos.sh', 'utf8');

    assert.ok(enterpriseMac.length > 500, 'macOS collector must be non-empty');
    assert.strictEqual(
      enterpriseMac,
      publicMac,
      'enterprise/collectors/macos.sh and public/collectors/macos.sh must maintain byte-for-byte parity',
    );
    assert.match(enterpriseMac, /pbcopy/, 'macOS collector must include automatic clipboard copy');
  });

  it('asserts byte-for-byte parity between enterprise and public Ubuntu collectors', () => {
    const enterpriseUbuntu = readFileSync('enterprise/collectors/ubuntu.sh', 'utf8');
    const publicUbuntu = readFileSync('public/collectors/ubuntu.sh', 'utf8');

    assert.ok(enterpriseUbuntu.length > 500, 'Ubuntu collector must be non-empty');
    assert.strictEqual(
      enterpriseUbuntu,
      publicUbuntu,
      'enterprise/collectors/ubuntu.sh and public/collectors/ubuntu.sh must maintain byte-for-byte parity',
    );
    assert.match(enterpriseUbuntu, /wl-copy|xclip/, 'Ubuntu collector must include automatic clipboard copy');
  });

  it('asserts byte-for-byte parity between enterprise and public Windows collectors (including windows11.ps1)', () => {
    const enterpriseWin = readFileSync('enterprise/collectors/windows.ps1', 'utf8');
    const publicWin = readFileSync('public/collectors/windows.ps1', 'utf8');
    const publicWin11 = readFileSync('public/collectors/windows11.ps1', 'utf8');

    assert.ok(enterpriseWin.length > 500, 'Windows collector must be non-empty');
    assert.strictEqual(
      enterpriseWin,
      publicWin,
      'enterprise/collectors/windows.ps1 and public/collectors/windows.ps1 must maintain byte-for-byte parity',
    );
    assert.strictEqual(
      enterpriseWin,
      publicWin11,
      'enterprise/collectors/windows.ps1 and public/collectors/windows11.ps1 must maintain byte-for-byte parity',
    );
    assert.match(enterpriseWin, /Set-Clipboard/, 'Windows collector must include automatic clipboard copy');
  });

  it('verifies all collector scripts forbid destructive and elevated commands', () => {
    const scripts = [
      'enterprise/collectors/macos.sh',
      'enterprise/collectors/ubuntu.sh',
      'enterprise/collectors/windows.ps1',
    ];

    for (const path of scripts) {
      const content = readFileSync(path, 'utf8');
      assert.doesNotMatch(content, /sudo\s/i, `${path} must not contain sudo`);
      assert.doesNotMatch(content, /kill\s+-9/i, `${path} must not contain SIGKILL`);
      assert.doesNotMatch(content, /rm\s+-rf/i, `${path} must not contain rm -rf`);
      assert.doesNotMatch(content, /runas\s/i, `${path} must not contain runas`);
      assert.doesNotMatch(content, /Set-ItemProperty/i, `${path} must not modify registry`);
    }
  });
});
