import test from 'node:test';
import assert from 'node:assert/strict';
import type { TelemetrySnapshot } from '../lib/enterprise/contracts';
import { validateTelemetrySnapshot } from '../lib/enterprise/telemetry-validation';

function fixture(): TelemetrySnapshot {
  return { schemaVersion: 1, collectionId: '852c4f6c-672b-4a83-9d61-c572fda5bd18', platform: 'windows',
    osVersion: 'Windows 11 24H2', architecture: 'x64', source: 'synthetic', collectorVersion: null,
    collectedAt: '2026-10-15T18:02:03.000Z', sampleIntervalMs: null, cpuPercent: null,
    memoryTotalMb: null, memoryUsedMb: null, diskTotalGb: null, diskFreeGb: null,
    dnsResolved: null, gatewayLatencyMs: null, processes: [], eventExcerpts: [], errors: [] };
}
function rejected(input: unknown) {
  assert.deepEqual(validateTelemetrySnapshot(input), { ok: false, error: 'Invalid telemetry snapshot.' });
}

test('telemetry unknown readings remain null and valid zeros remain real observations', () => {
  const unknown = fixture();
  assert.deepEqual(validateTelemetrySnapshot(unknown), { ok: true, value: unknown });
  const zero = { ...fixture(), cpuPercent: 0, memoryTotalMb: 0, memoryUsedMb: 0, diskTotalGb: 0,
    diskFreeGb: 0, gatewayLatencyMs: 0, dnsResolved: false,
    processes: [{ pid: 0, name: 'System Idle Process', cpuPercent: 0, memoryMb: 0 }] };
  assert.deepEqual(validateTelemetrySnapshot(zero), { ok: true, value: zero });
});

test('every platform/source is explicit and collector evidence requires a version', () => {
  for (const platform of ['windows', 'macos', 'ubuntu'] as const) {
    for (const source of ['collector', 'user-reported', 'synthetic'] as const) {
      const input = { ...fixture(), platform, source, collectorVersion: source === 'collector' ? '1.0.0-test+1' : null };
      assert.deepEqual(validateTelemetrySnapshot(input), { ok: true, value: input });
    }
  }
  rejected({ ...fixture(), source: 'collector' });
  rejected({ ...fixture(), source: undefined });
  rejected({ ...fixture(), source: 'automatically-scanned' });
  rejected({ ...fixture(), architecture: 'x86' });
  rejected({ ...fixture(), collectorVersion: '' });
});

test('telemetry rejects missing fields, wrong types and hidden command/credential properties at every level', () => {
  for (const key of Object.keys(fixture())) {
    const input = { ...fixture() } as Record<string, unknown>;
    delete input[key];
    rejected(input);
  }
  for (const value of [null, [], 'telemetry', { ...fixture(), rawOutput: 'secret' },
    { ...fixture(), password: 'secret' }, { ...fixture(), cpuPercent: '0' },
    { ...fixture(), dnsResolved: 'false' }, { ...fixture(), schemaVersion: '1' },
    { ...fixture(), processes: [{ pid: 1, name: 'Fixture', cpuPercent: null, memoryMb: null, commandLine: 'secret' }] },
    { ...fixture(), eventExcerpts: [{ eventId: '1', text: 'Fixture', token: 'secret' }] },
    { ...fixture(), errors: [{ checkId: 'cpu', code: 'timeout', rawOutput: 'secret' }] }]) rejected(value);
});

test('telemetry enforces finite ranges and total/used relationships without inventing unknown totals', () => {
  for (const key of ['cpuPercent', 'sampleIntervalMs', 'memoryTotalMb', 'memoryUsedMb', 'diskTotalGb',
    'diskFreeGb', 'gatewayLatencyMs']) {
    for (const value of [NaN, Infinity, -Infinity, -1]) rejected({ ...fixture(), [key]: value });
  }
  rejected({ ...fixture(), cpuPercent: 100.01 });
  rejected({ ...fixture(), sampleIntervalMs: 0 });
  rejected({ ...fixture(), sampleIntervalMs: 3600001 });
  rejected({ ...fixture(), memoryTotalMb: 1024, memoryUsedMb: 1025 });
  rejected({ ...fixture(), diskTotalGb: 100, diskFreeGb: 101 });
  assert.equal(validateTelemetrySnapshot({ ...fixture(), memoryUsedMb: 1024 }).ok, true);
  rejected({ ...fixture(), processes: [{ pid: 1.5, name: 'Fixture', cpuPercent: 0, memoryMb: 0 }] });
  rejected({ ...fixture(), processes: [{ pid: 1, name: 'Fixture', cpuPercent: 101, memoryMb: 0 }] });
});

test('collection IDs and UTC calendar timestamps are validated rather than coerced', () => {
  for (const collectionId of ['not-a-uuid', 'relay-key-123', fixture().collectionId + ',other']) rejected({ ...fixture(), collectionId });
  for (const collectedAt of ['2026-02-30T12:00:00Z', '2026-10-15', '2026-10-15T18:02:03+00:00',
    '2026-10-15T25:00:00Z', '2026-10-15T18:02:03.1234Z']) rejected({ ...fixture(), collectedAt });
  for (const collectedAt of ['2024-02-29T12:00:00Z', '2026-10-15T18:02:03.1Z']) {
    assert.equal(validateTelemetrySnapshot({ ...fixture(), collectedAt }).ok, true);
  }
});

test('nested text is bounded plain text and hostile error responses never echo input', () => {
  for (const eventText of ['<script>steal()</script>', '<img src=x onerror=steal()>', '\u0000private-secret', 'x'.repeat(513)]) {
    rejected({ ...fixture(), eventExcerpts: [{ eventId: 'event-1', text: eventText }] });
  }
  rejected({ ...fixture(), osVersion: { html: '<script>secret</script>' } });
  rejected({ ...fixture(), processes: [{ pid: 1, name: '<svg onload=steal()>', cpuPercent: null, memoryMb: null }] });
  rejected({ ...fixture(), errors: [{ checkId: '../../secret', code: 'timeout' }] });
  rejected({ ...fixture(), errors: [{ checkId: 'cpu', code: 'secret-error-text' }] });
  assert.equal(validateTelemetrySnapshot({ ...fixture(), eventExcerpts: [{ eventId: '1', text: 'x'.repeat(512) }] }).ok, true);
});

test('collection arrays are bounded and successful parsing returns copied nested values', () => {
  const process = { pid: 1, name: 'Fixture', cpuPercent: null, memoryMb: null };
  const event = { eventId: '1', text: 'Synthetic event excerpt' };
  const error = { checkId: 'cpu', code: 'timeout' as const };
  const input = { ...fixture(), processes: Array.from({ length: 20 }, () => ({ ...process })),
    eventExcerpts: Array.from({ length: 20 }, () => ({ ...event })), errors: Array.from({ length: 32 }, () => ({ ...error })) };
  const result = validateTelemetrySnapshot(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Fixture rejected');
  input.processes[0].name = 'Changed';
  assert.equal(result.value.processes[0].name, 'Fixture');
  rejected({ ...fixture(), processes: Array(21).fill(process) });
  rejected({ ...fixture(), eventExcerpts: Array(21).fill(event) });
  rejected({ ...fixture(), errors: Array(33).fill(error) });
  rejected({ ...fixture(), processes: new Array(2) });
});

test('telemetry rejects accessor objects without executing getters or accepting prototypes', () => {
  const hostile = { ...fixture() };
  let read = false;
  Object.defineProperty(hostile, 'cpuPercent', { enumerable: true, get() { read = true; return 10; } });
  rejected(hostile);
  assert.equal(read, false);
  rejected(Object.assign(Object.create({ rawOutput: 'secret' }), fixture()));
});
