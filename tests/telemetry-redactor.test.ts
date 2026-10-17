import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactTelemetryPayload } from '../lib/telemetry-redactor';
import type { TelemetrySnapshot } from '../lib/enterprise/contracts';

function sampleSnapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    schemaVersion: 1,
    collectionId: '00000000-0000-4000-8000-000000000001',
    platform: 'windows',
    osVersion: '10.0.22631',
    architecture: 'x64',
    source: 'collector',
    collectorVersion: '1.0.0',
    collectedAt: new Date().toISOString(),
    sampleIntervalMs: 1000,
    cpuPercent: 45.2,
    memoryTotalMb: 16384,
    memoryUsedMb: 8192,
    diskTotalGb: 512,
    diskFreeGb: 128,
    dnsResolved: true,
    gatewayLatencyMs: 15,
    processes: [
      {
        pid: 1234,
        name: 'chrome.exe',
        cpuPercent: 12.5,
        memoryMb: 450,
      },
    ],
    eventExcerpts: [],
    errors: [],
    ...overrides,
  };
}

test('redactTelemetryPayload scrubs Windows user paths', () => {
  const snapshot = sampleSnapshot({
    processes: [
      {
        pid: 2001,
        name: 'C:\\Users\\fuwad\\AppData\\Local\\Slack\\slack.exe',
        cpuPercent: 5.0,
        memoryMb: 200,
      },
    ],
  });
  const { payload, redactedFieldsCount } = redactTelemetryPayload(snapshot);
  assert.equal(payload.processes[0].name, 'C:\\Users\\[REDACTED]\\AppData\\Local\\Slack\\slack.exe');
  assert.ok(redactedFieldsCount >= 1);
});

test('redactTelemetryPayload scrubs macOS/Linux user paths', () => {
  const snapshot = sampleSnapshot({
    processes: [
      {
        pid: 3001,
        name: '/Users/johndoe/Applications/Code.app',
        cpuPercent: 8.0,
        memoryMb: 350,
      },
      {
        pid: 3002,
        name: '/home/ubuntu/app/server',
        cpuPercent: 2.0,
        memoryMb: 100,
      },
    ],
  });
  const { payload, redactedFieldsCount } = redactTelemetryPayload(snapshot);
  assert.equal(payload.processes[0].name, '/Users/[REDACTED]/Applications/Code.app');
  assert.equal(payload.processes[1].name, '/home/[REDACTED]/app/server');
  assert.ok(redactedFieldsCount >= 2);
});

test('redactTelemetryPayload scrubs private IPv4 addresses', () => {
  const snapshot = sampleSnapshot({
    processes: [
      {
        pid: 4001,
        name: 'curl 192.168.1.100:8080/metrics',
        cpuPercent: 1.0,
        memoryMb: 50,
      },
      {
        pid: 4002,
        name: 'ssh 10.0.0.5',
        cpuPercent: 0.5,
        memoryMb: 30,
      },
    ],
  });
  const { payload, redactedFieldsCount } = redactTelemetryPayload(snapshot);
  assert.ok(!payload.processes[0].name.includes('192.168.1.100'));
  assert.ok(payload.processes[0].name.includes('[PRIVATE-IP]'));
  assert.ok(!payload.processes[1].name.includes('10.0.0.5'));
  assert.ok(payload.processes[1].name.includes('[PRIVATE-IP]'));
  assert.ok(redactedFieldsCount >= 2);
});

test('redactTelemetryPayload scrubs MAC addresses and API keys', () => {
  const snapshot = sampleSnapshot({
    processes: [
      {
        pid: 5001,
        name: 'agent --mac 00:1A:2B:3C:4D:5E --token Bearer sk-ant-api03-abcdef1234567890abcdef',
        cpuPercent: 2.0,
        memoryMb: 80,
      },
    ],
  });
  const { payload, redactedFieldsCount } = redactTelemetryPayload(snapshot);
  assert.ok(!payload.processes[0].name.includes('00:1A:2B:3C:4D:5E'));
  assert.ok(payload.processes[0].name.includes('[MAC-REDACTED]'));
  assert.ok(!payload.processes[0].name.includes('sk-ant-api03'));
  assert.ok(payload.processes[0].name.includes('[KEY-REDACTED]'));
  assert.ok(redactedFieldsCount >= 2);
});

test('redactTelemetryPayload preserves non-string and benign readings unchanged', () => {
  const snapshot = sampleSnapshot();
  const { payload, redactedFieldsCount } = redactTelemetryPayload(snapshot);
  assert.equal(payload.cpuPercent, 45.2);
  assert.equal(payload.memoryTotalMb, 16384);
  assert.equal(payload.diskFreeGb, 128);
  assert.equal(payload.dnsResolved, true);
  assert.equal(payload.processes[0].name, 'chrome.exe');
  assert.equal(redactedFieldsCount, 0);
});
