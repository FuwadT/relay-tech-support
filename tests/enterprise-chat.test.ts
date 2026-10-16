/**
 * Tests for Enterprise Conversational Investigation (Task E3-01).
 * Verifies prompt evaluation, zero-install resolution, progressive authorization,
 * synthetic telemetry generation, and evidence analysis integration.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DevicePlatform, TelemetrySnapshot } from '../lib/enterprise/contracts';
import {
  analyzeEnterpriseTelemetry,
  formatCpuUsage,
  formatMemoryUsage,
  formatDiskFree,
  generateSymptomAwareExplanation,
  explainTelemetryQuestion,
} from '../lib/enterprise/findings';
import { getCollectorTerminalSnippet } from '../lib/enterprise/collector-scripts';

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

describe('UX Redesign & Error Remediation Invariants', () => {
  it('formatCpuUsage returns "Not sampled" for null or NaN and rounded percentage for valid numbers', () => {
    assert.strictEqual(formatCpuUsage(null), 'Not sampled');
    assert.strictEqual(formatCpuUsage(undefined), 'Not sampled');
    assert.strictEqual(formatCpuUsage(NaN), 'Not sampled');
    assert.strictEqual(formatCpuUsage(45.7), '46%');
    assert.strictEqual(formatCpuUsage(0), '0%');
  });

  it('formatMemoryUsage returns clean percentage and gigabytes without noisy raw floats', () => {
    assert.strictEqual(formatMemoryUsage(null, 16384), 'Not sampled');
    assert.strictEqual(formatMemoryUsage(1746.883, 8325.325), '21% (1.7 / 8.1 GB)');
    assert.strictEqual(formatMemoryUsage(8192, 16384), '50% (8.0 / 16.0 GB)');
  });

  it('formatDiskFree returns percentage free and rounded gigabytes', () => {
    assert.strictEqual(formatDiskFree(null, 512), 'Not sampled');
    assert.strictEqual(formatDiskFree(1019.504, 1081.101), '94% free (1020 / 1081 GB)');
    assert.strictEqual(formatDiskFree(18, 512), '4% free (18 / 512 GB)');
  });

  it('generateSymptomAwareExplanation bridges reported CPU symptom with alternative detected faults', () => {
    const dnsFaultSnapshot: TelemetrySnapshot = {
      schemaVersion: 1,
      collectionId: '00000000-0000-4000-8000-000000000001',
      platform: 'windows',
      osVersion: 'Windows 11',
      architecture: 'x64',
      source: 'synthetic',
      collectorVersion: '1.2.0',
      collectedAt: new Date().toISOString(),
      sampleIntervalMs: 5000,
      cpuPercent: null,
      memoryTotalMb: 16384,
      memoryUsedMb: 4000,
      diskTotalGb: 512,
      diskFreeGb: 300,
      dnsResolved: false,
      gatewayLatencyMs: 150,
      processes: [],
      eventExcerpts: [],
      errors: [],
    };

    const findings = analyzeEnterpriseTelemetry(dnsFaultSnapshot);
    const explanation = generateSymptomAwareExplanation('cpu', dnsFaultSnapshot, findings);
    assert.ok(
      explanation.includes('high CPU utilization and loud fan noise'),
      'Must reference the user reported symptom',
    );
    assert.ok(
      explanation.includes('DNS resolution failure'),
      'Must identify the actual detected anomaly',
    );
  });

  it('explainTelemetryQuestion answers follow-up CPU questions directly from snapshot metrics', () => {
    const snapshot: TelemetrySnapshot = {
      schemaVersion: 1,
      collectionId: '00000000-0000-4000-8000-000000000002',
      platform: 'windows',
      osVersion: 'Windows 11',
      architecture: 'x64',
      source: 'synthetic',
      collectorVersion: '1.2.0',
      collectedAt: new Date().toISOString(),
      sampleIntervalMs: 5000,
      cpuPercent: 91.2,
      memoryTotalMb: 16384,
      memoryUsedMb: 12000,
      diskTotalGb: 512,
      diskFreeGb: 100,
      dnsResolved: true,
      gatewayLatencyMs: 15,
      processes: [
        { pid: 101, name: 'SearchIndexer.exe', cpuPercent: 78.4, memoryMb: 800 },
      ],
      eventExcerpts: [],
      errors: [],
    };

    const findings = analyzeEnterpriseTelemetry(snapshot);
    const answer = explainTelemetryQuestion(
      'the fan noise is really high, do I have high CPU usage?',
      snapshot,
      findings,
      'cpu',
    );

    assert.ok(answer.includes('91%'), 'Must state current CPU usage');
    assert.ok(answer.includes('High CPU usage was confirmed'), 'Must confirm elevated CPU condition');
    assert.ok(answer.includes('SearchIndexer.exe'), 'Must list top process');
  });

  it('getCollectorTerminalSnippet writes to safe system temp directories on all platforms', () => {
    const winSnippet = getCollectorTerminalSnippet('windows', 'http://127.0.0.1:8790');
    assert.ok(winSnippet.includes('$env:TEMP'), 'Windows collector snippet must use $env:TEMP');
    assert.ok(winSnippet.includes('relay-inspect.ps1'), 'Windows collector snippet must name temp file');
    assert.ok(winSnippet.includes('Unblock-File'), 'Windows collector snippet must unblock downloaded script');
    assert.doesNotMatch(winSnippet, /-OutFile inspect\.ps1/, 'Must not use relative inspect.ps1 output');

    const macSnippet = getCollectorTerminalSnippet('macos', 'http://127.0.0.1:8790');
    assert.ok(macSnippet.includes('/tmp/relay-inspect.sh'), 'macOS collector snippet must use /tmp');

    const ubuSnippet = getCollectorTerminalSnippet('ubuntu', 'http://127.0.0.1:8790');
    assert.ok(ubuSnippet.includes('/tmp/relay-inspect.sh'), 'Ubuntu collector snippet must use /tmp');
  });
});

