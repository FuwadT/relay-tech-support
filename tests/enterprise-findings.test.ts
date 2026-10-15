import test from 'node:test';
import assert from 'node:assert/strict';
import type { TelemetrySnapshot } from '../lib/enterprise/contracts';
import { analyzeEnterpriseTelemetry } from '../lib/enterprise/findings';
import { validateTelemetrySnapshot } from '../lib/enterprise/telemetry-validation';

function fixture(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  const parsed = validateTelemetrySnapshot({ schemaVersion: 1,
    collectionId: '852c4f6c-672b-4a83-9d61-c572fda5bd18', platform: 'windows', osVersion: 'Windows 11',
    architecture: 'x64', source: 'user-reported', collectorVersion: null,
    collectedAt: '2026-10-15T18:02:03.000Z', sampleIntervalMs: null, cpuPercent: null,
    memoryTotalMb: null, memoryUsedMb: null, diskTotalGb: null, diskFreeGb: null,
    dnsResolved: null, gatewayLatencyMs: null, processes: [], eventExcerpts: [], errors: [], ...overrides });
  assert.ok(parsed.ok);
  return parsed.value;
}

test('missing and ordinary readings request evidence without claiming a healthy device', () => {
  const unknown = analyzeEnterpriseTelemetry(fixture());
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].severity, 'info');
  assert.deepEqual(unknown[0].evidenceIds, []);
  assert.match(unknown[0].observation, /unknown/);
  const normal = analyzeEnterpriseTelemetry(fixture({ cpuPercent: 20, sampleIntervalMs: 1000,
    memoryTotalMb: 10000, memoryUsedMb: 2000, diskTotalGb: 100, diskFreeGb: 50, dnsResolved: true, gatewayLatencyMs: 5 }));
  assert.deepEqual(normal.map(finding => finding.id), ['more-evidence']);
  assert.match(normal[0].observation, /not a clean bill of health/);
});

test('threshold findings trace exact readings and never invent root causes or actions', () => {
  const findings = analyzeEnterpriseTelemetry(fixture({ cpuPercent: 85, sampleIntervalMs: 2000,
    memoryTotalMb: 10000, memoryUsedMb: 9000, diskTotalGb: 200, diskFreeGb: 20,
    dnsResolved: false, gatewayLatencyMs: 100 }));
  assert.deepEqual(findings.map(finding => finding.id), ['cpu-high', 'memory-high', 'disk-free-low', 'dns-unsuccessful', 'gateway-latency-high']);
  for (const finding of findings) {
    assert.match(finding.observation, /User-reported/);
    assert.match(finding.observation, /2000 ms/);
    assert.ok(finding.evidenceIds.length > 0);
    assert.match(finding.hypothesis!, /^Possible/);
    assert.deepEqual(finding.recommendedCheckIds, []);
    assert.doesNotMatch(JSON.stringify(finding), /Stop-Process|rm -rf|motherboard|corrupted thread|DHCP/);
  }
});

test('zero is preserved and unknown or zero totals cannot manufacture ratio findings', () => {
  const result = analyzeEnterpriseTelemetry(fixture({ cpuPercent: 0, sampleIntervalMs: 1000,
    memoryTotalMb: 0, memoryUsedMb: 0, diskTotalGb: 0, diskFreeGb: 0, gatewayLatencyMs: 0 }));
  assert.deepEqual(result.map(finding => finding.id), ['more-evidence']);
  const absentTotals = analyzeEnterpriseTelemetry(fixture({ memoryUsedMb: 9999, diskFreeGb: 0 }));
  assert.deepEqual(absentTotals.map(finding => finding.id), ['more-evidence']);
  assert.equal(analyzeEnterpriseTelemetry(fixture({ diskTotalGb: 100, diskFreeGb: 0 }))[0].id, 'disk-free-low');
});

test('CPU requires sample conditions and contradictory process readings ask for recheck', () => {
  const result = analyzeEnterpriseTelemetry(fixture({ cpuPercent: 20, memoryTotalMb: 1000,
    processes: [{ pid: 42, name: 'Fixture', cpuPercent: 80, memoryMb: 2000 }] }));
  assert.deepEqual(result.map(finding => finding.id), ['cpu-sample-unknown', 'process-cpu-recheck-0', 'process-memory-recheck-0']);
  assert.match(result[0].observation, /Do not treat it as sustained or comparable/);
  assert.ok(result[1].evidenceIds.includes('/processes/0/cpuPercent'));
  assert.match(result[1].observation, /same interval/);
  assert.match(result[2].observation, /Recheck/);
});

test('every synthetic finding is explicitly demo evidence and collector imports remain unverified', () => {
  const synthetic = analyzeEnterpriseTelemetry(fixture({ source: 'synthetic', cpuPercent: 100,
    memoryTotalMb: 100, memoryUsedMb: 100, diskTotalGb: 100, diskFreeGb: 0,
    dnsResolved: false, gatewayLatencyMs: 500 }));
  assert.ok(synthetic.length >= 5);
  for (const finding of synthetic) assert.match(finding.observation, /^Synthetic demo data; these are not readings from a real device\./);
  const collector = analyzeEnterpriseTelemetry(fixture({ source: 'collector', collectorVersion: '1.0.0', dnsResolved: false }));
  assert.match(collector[0].observation, /conditions have not been independently verified/);
});

test('invalid input boundary cannot fabricate observations or propagate hostile text', () => {
  const invalid = { ...fixture(), cpuPercent: 101 };
  assert.equal(validateTelemetrySnapshot(invalid).ok, false);
  const findings = analyzeEnterpriseTelemetry(invalid);
  assert.deepEqual(findings.map(finding => finding.id), ['invalid-snapshot']);
  assert.deepEqual(findings[0].evidenceIds, []);
  assert.equal(findings[0].hypothesis, null);
  const hostile = { ...fixture(), processes: [{ pid: 1, name: '<script>secret</script>', cpuPercent: 95, memoryMb: 1 }] };
  assert.equal(validateTelemetrySnapshot(hostile).ok, false);
  assert.doesNotMatch(JSON.stringify(analyzeEnterpriseTelemetry(hostile)), /secret|script/);
});
