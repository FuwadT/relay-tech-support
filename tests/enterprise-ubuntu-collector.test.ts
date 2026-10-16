/**
 * Tests for the Ubuntu Telemetry Collector (Task E4-04).
 * Verifies read-only system telemetry sampling on Ubuntu x64 platforms
 * conforming strictly to canonical TelemetrySnapshot schemas.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { validateTelemetrySnapshot } from '../lib/enterprise/telemetry-validation';

const script = resolve(process.cwd(), 'enterprise/collectors/ubuntu.sh');
const isLinux = process.platform === 'linux';

describe('E4-04: Ubuntu Telemetry Collector', { skip: !isLinux && 'Requires Linux environment' }, () => {
  it('collector script is read-only and does not invoke destructive or elevated commands', () => {
    const source = readFileSync(script, 'utf8');
    assert.doesNotMatch(source, /\bsudo\b/i, 'Must not require or execute sudo');
    assert.doesNotMatch(source, /\brm\s+-rf\b/i, 'Must not execute destructive removal');
    assert.doesNotMatch(source, /\bkill\s+-9\b/i, 'Must not execute force-kill');
    assert.doesNotMatch(source, /\bcurl\b|\bwget\b/i, 'Must not perform unauthenticated network calls');
  });

  it('rejects invalid collection-id with non-zero exit code and controlled error message', () => {
    const result = spawnSync('bash', [script, '--collection-id', 'invalid-not-a-uuid'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('Invalid collection-id: must be a valid UUID.'));
  });

  it('runs natively on Ubuntu x64 and emits valid TelemetrySnapshot JSON', () => {
    const customId = '00000000-0000-4000-8000-000000000002';
    const result = spawnSync('bash', [script, '--collection-id', customId], {
      encoding: 'utf8',
      timeout: 15000,
    });

    assert.strictEqual(result.status, 0, `Collector failed with error: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());

    // Validate using canonical schema validator
    const validation = validateTelemetrySnapshot(parsed);
    assert.strictEqual(validation.ok, true, 'Snapshot must satisfy validateTelemetrySnapshot');

    assert.strictEqual(parsed.collectionId, customId);
    assert.strictEqual(parsed.platform, 'ubuntu');
    assert.strictEqual(parsed.architecture, 'x64');
    assert.strictEqual(parsed.source, 'collector');
    assert.strictEqual(parsed.collectorVersion, '1.0.0');
    assert.strictEqual(parsed.cpuPercent, null, 'Machine-wide CPU must remain null when not collected');
    assert.strictEqual(parsed.dnsResolved, null);
    assert.strictEqual(parsed.gatewayLatencyMs, null);

    // Verify sampling interval is at least 1000ms
    assert.ok(parsed.sampleIntervalMs >= 1000, 'Collector must report its ~1-second measurement interval');

    // Verify memory and disk numbers
    if (parsed.memoryTotalMb !== null && parsed.memoryUsedMb !== null) {
      assert.ok(parsed.memoryTotalMb > 0);
      assert.ok(parsed.memoryUsedMb >= 0);
      assert.ok(parsed.memoryUsedMb <= parsed.memoryTotalMb);
    }
    if (parsed.diskTotalGb !== null && parsed.diskFreeGb !== null) {
      assert.ok(parsed.diskTotalGb > 0);
      assert.ok(parsed.diskFreeGb >= 0);
      assert.ok(parsed.diskFreeGb <= parsed.diskTotalGb);
    }

    // Verify processes
    assert.ok(Array.isArray(parsed.processes));
    assert.ok(parsed.processes.length <= 20);
    for (const p of parsed.processes) {
      assert.strictEqual(typeof p.pid, 'number');
      assert.strictEqual(typeof p.name, 'string');
      assert.ok(p.name.length <= 128);
      assert.doesNotMatch(p.name, /[<>\u0000-\u001f]/, 'Process names must be sanitized');
      if (p.cpuPercent !== null) {
        assert.ok(p.cpuPercent >= 0 && p.cpuPercent <= 100);
      }
    }

    // Verify errors
    assert.ok(Array.isArray(parsed.errors));
    assert.ok(parsed.errors.length <= 32);
    assert.ok(parsed.errors.some((e: { checkId: string }) => e.checkId === 'machine-cpu-not-collected'));
  });

  it('handles --include-network flag and records unsupported network probes error', () => {
    const result = spawnSync('bash', [script, '--include-network'], {
      encoding: 'utf8',
      timeout: 15000,
    });

    assert.strictEqual(result.status, 0);
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok(
      parsed.errors.some((e: { checkId: string }) => e.checkId === 'network-probes-not-implemented'),
      'Must record network-probes-not-implemented when network checks requested',
    );
  });
});
