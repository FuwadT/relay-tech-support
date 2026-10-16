/**
 * Tests for the macOS Telemetry Collector (Task E4-03).
 * Verifies read-only constraints, safe refusal on unsupported platforms,
 * and collection ID validation for Apple Silicon macOS workstations.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const script = resolve(process.cwd(), 'enterprise/collectors/macos.sh');
const isMacOS = process.platform === 'darwin' && process.arch === 'arm64';

describe('E4-03: macOS Telemetry Collector', () => {
  it('collector script is read-only and does not invoke destructive or elevated commands', () => {
    const source = readFileSync(script, 'utf8');
    assert.doesNotMatch(source, /\bsudo\b/i, 'Must not require or execute sudo');
    assert.doesNotMatch(source, /\brm\s+-rf\b/i, 'Must not execute destructive removal');
    assert.doesNotMatch(source, /\bkill\s+-9\b/i, 'Must not execute force-kill');
    assert.doesNotMatch(source, /\bcurl\b|\bwget\b/i, 'Must not perform unauthenticated network calls');
  });

  it('rejects invalid collection-id with non-zero exit code and controlled error message', () => {
    const result = spawnSync('bash', [script, '--collection-id', 'invalid-uuid'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('Invalid collection-id: must be a valid UUID.'));
  });

  it('safely refuses execution on non-macOS or non-arm64 hosts without fabricating output', () => {
    if (isMacOS) return; // Skip on real macOS arm64

    const result = spawnSync('bash', [script, '--collection-id', '00000000-0000-4000-8000-000000000003'], {
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.notStrictEqual(result.status, 0, 'Must exit with non-zero on non-macOS arm64 platform');
    assert.strictEqual(result.stdout.trim(), '', 'Must not output snapshot JSON on unsupported platform');
    assert.ok(
      result.stderr.includes('requires a verified macOS on Apple Silicon (arm64) workstation'),
      'Must print clear requirement error to stderr',
    );
  });
});
