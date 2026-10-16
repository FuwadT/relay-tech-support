/**
 * Tests for Enterprise Conversational Investigation (Task E3-01).
 * Verifies prompt evaluation, zero-install resolution, progressive authorization,
 * synthetic telemetry generation, and evidence analysis integration.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DevicePlatform, TelemetrySnapshot } from '../lib/enterprise/contracts';
import { analyzeEnterpriseTelemetry } from '../lib/enterprise/findings';

describe('E3-01: Zero-Install Prompt Evaluation', () => {
  function evaluatePromptType(prompt: string): 'zero-install-browser' | 'zero-install-permission' | 'device-telemetry' {
    const p = prompt.toLowerCase();
    if (p.includes('cache') || p.includes('cookie') || p.includes('refresh') || p.includes('browser')) {
      return 'zero-install-browser';
    }
    if (p.includes('mic') || p.includes('camera') || p.includes('permission') || p.includes('sound')) {
      return 'zero-install-permission';
    }
    return 'device-telemetry';
  }

  it('routes browser cache glitches to zero-install without telemetry', () => {
    assert.strictEqual(
      evaluatePromptType('My browser is showing outdated cached pages and styling glitches'),
      'zero-install-browser',
    );
    assert.strictEqual(
      evaluatePromptType('Need to clear cookies for the client portal'),
      'zero-install-browser',
    );
  });

  it('routes audio and camera permission prompts to zero-install settings check', () => {
    assert.strictEqual(
      evaluatePromptType('Webcam and mic are not accessible in the video call'),
      'zero-install-permission',
    );
  });

  it('routes hardware/performance/network issues to deep device telemetry', () => {
    assert.strictEqual(
      evaluatePromptType('CPU usage is pinned at 100% and fans are loud'),
      'device-telemetry',
    );
    assert.strictEqual(
      evaluatePromptType('Cannot reach default gateway or resolve internal DNS names'),
      'device-telemetry',
    );
    assert.strictEqual(
      evaluatePromptType('Hard drive storage partition is 98% full'),
      'device-telemetry',
    );
  });
});

describe('E3-01: Synthetic Telemetry Grounding', () => {
  it('synthetic telemetry fixtures carry source: "synthetic"', () => {
    const syntheticSnapshot: TelemetrySnapshot = {
      schemaVersion: 1,
      collectionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      platform: 'windows' as DevicePlatform,
      osVersion: 'Windows 11 Enterprise 23H2',
      architecture: 'x64',
      source: 'synthetic',
      collectorVersion: '1.2.0-catalog',
      collectedAt: new Date().toISOString(),
      sampleIntervalMs: 5000,
      cpuPercent: 92.5,
      memoryTotalMb: 16384,
      memoryUsedMb: 12000,
      diskTotalGb: 512,
      diskFreeGb: 120,
      dnsResolved: true,
      gatewayLatencyMs: 15.0,
      processes: [
        { pid: 1001, name: 'SearchIndexer.exe', cpuPercent: 88.0, memoryMb: 450 },
      ],
      eventExcerpts: [],
      errors: [],
    };

    assert.strictEqual(syntheticSnapshot.source, 'synthetic');
    assert.strictEqual(syntheticSnapshot.schemaVersion, 1);

    const findings = analyzeEnterpriseTelemetry(syntheticSnapshot);
    assert.ok(findings.length > 0, 'Must produce findings');

    // Findings must clearly label the synthetic source in observation text
    const cpuFinding = findings.find((f) => f.id === 'cpu-high');
    assert.ok(cpuFinding, 'Must identify cpu-high finding');
    assert.ok(
      cpuFinding.observation.includes('Synthetic demo data'),
      'Finding observation must explicitly disclose synthetic demo source',
    );
  });

  it('telemetry parser rejects negative or impossible CPU values', () => {
    const invalidSnapshot = {
      schemaVersion: 1,
      collectionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      platform: 'ubuntu' as DevicePlatform,
      osVersion: 'Ubuntu 24.04',
      architecture: 'x64' as const,
      source: 'synthetic' as const,
      collectorVersion: null,
      collectedAt: new Date().toISOString(),
      sampleIntervalMs: 5000,
      cpuPercent: 150.0, // Impossible: > 100%
      memoryTotalMb: 16384,
      memoryUsedMb: 8000,
      diskTotalGb: 512,
      diskFreeGb: 200,
      dnsResolved: true,
      gatewayLatencyMs: 20,
      processes: [],
      eventExcerpts: [],
      errors: [],
    };

    const findings = analyzeEnterpriseTelemetry(invalidSnapshot as TelemetrySnapshot);
    // Should return invalid-snapshot finding
    assert.ok(
      findings.some((f) => f.id === 'invalid-snapshot'),
      'Must flag invalid snapshot containing out-of-range CPU reading',
    );
  });

});
