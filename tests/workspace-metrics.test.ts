import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CaseMeasurements, CaseRecord } from '../lib/contracts';
import { DIAGNOSTIC_RULE_VERSION } from '../lib/diagnostics';
import { summarizeWorkspaceMetrics } from '../lib/workspace-metrics';

function fixture(id: string, changes: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id, title: 'Synthetic metrics fixture', description: 'Local unit fixture only.', deviceName: 'Fixture',
    category: 'performance', os: 'windows11', ownership: 'personal', status: 'open', answers: {},
    measurements: {}, ruleVersion: DIAGNOSTIC_RULE_VERSION, notes: '',
    createdAt: '2026-10-15T12:00:00.000Z', updatedAt: '2026-10-15T12:00:00.000Z', verifiedAt: null,
    ...changes,
  };
}
const performanceAnswers = { scope: 'whole_device', resources: 'normal', storage: 'enough', restart: 'same' };

test('empty metrics retain zero denominators without inventing rates or readings', () => {
  const result = summarizeWorkspaceMetrics([]);
  assert.equal(result.caseCount, 0);
  assert.equal(result.totalChecks, 0);
  assert.equal(result.completedCases, 0);
  assert.equal(result.coverageAvailable, true);
  assert.equal(result.metrics.length, 8);
  assert.ok(result.metrics.every(metric => metric.pairs === 0 && metric.improved === 0));
});

test('invalid historical options remain pending and cannot inflate usable coverage', () => {
  const result = summarizeWorkspaceMetrics([fixture('invalid', { answers: {
    scope: 'legacy_invalid', resources: 'legacy_invalid', storage: 'legacy_invalid', restart: 'legacy_invalid',
    invented_check: 'normal',
  } })]);
  assert.equal(result.completedCases, 0);
  assert.equal(result.usableChecks, 0);
  assert.equal(result.totalChecks, 4);
});

test('recognized unknown and not-tried answers complete entry but are not usable observations', () => {
  const result = summarizeWorkspaceMetrics([
    fixture('unknown', { answers: { scope: 'unknown', resources: 'normal', storage: 'unknown', restart: 'not_tried' } }),
    fixture('valid', { answers: performanceAnswers, status: 'resolved' }),
    fixture('pending', { answers: { scope: 'whole_device', resources: 'normal', storage: 'enough' }, status: 'escalated' }),
    fixture('closed', { status: 'closed' }),
  ]);
  assert.equal(result.caseCount, 4);
  assert.equal(result.completedCases, 2);
  assert.equal(result.usableChecks, 8);
  assert.equal(result.totalChecks, 16);
  assert.equal(result.resolvedCases, 1);
  assert.equal(result.escalatedCases, 1);
});

test('different measurements keep separate eligible-pair denominators and units', () => {
  const result = summarizeWorkspaceMetrics([
    fixture('performance-improved', { measurements: { baseline: { app_launch_seconds: 20, cpu_percent: 40 }, followUp: { app_launch_seconds: 12, cpu_percent: 60 } } }),
    fixture('performance-missing', { measurements: { baseline: { app_launch_seconds: 0 }, followUp: {} } }),
    fixture('network-improved', { category: 'network', measurements: { baseline: { download_mbps: 10, ping_latency_ms: 20 }, followUp: { download_mbps: 20, ping_latency_ms: 20 } } }),
    fixture('network-missing', { category: 'network' }),
  ]);
  const metric = (id: string) => result.metrics.find(item => item.id === id)!;
  assert.deepEqual(metric('app_launch_seconds'), { id: 'app_launch_seconds', label: 'App launch time', unit: 'sec', category: 'performance', pairs: 1, improved: 1 });
  assert.equal(metric('cpu_percent').pairs, 1);
  assert.equal(metric('cpu_percent').improved, 0);
  assert.equal(metric('download_mbps').pairs, 1);
  assert.equal(metric('download_mbps').improved, 1);
  assert.equal(metric('ping_latency_ms').pairs, 1);
  assert.equal(metric('ping_latency_ms').improved, 0);
  assert.equal(metric('upload_mbps').pairs, 0);
  assert.equal(result.caseCount, 4, 'Each metric can disclose eligible pairs against the entire cohort');
});

test('malformed historical readings never become pairs; valid zero remains recorded', () => {
  const malformed = { baseline: { cpu_percent: '40', memory_percent: -1, app_launch_seconds: null, free_storage_gb: Infinity },
    followUp: { cpu_percent: 20, memory_percent: 40, app_launch_seconds: 1, free_storage_gb: 20 } } as unknown as CaseMeasurements;
  const invalid = summarizeWorkspaceMetrics([fixture('invalid', { measurements: malformed })]);
  assert.ok(invalid.metrics.every(metric => metric.pairs === 0));
  const valid = summarizeWorkspaceMetrics([fixture('zero', { measurements: { baseline: { app_launch_seconds: 1 }, followUp: { app_launch_seconds: 0 } } })]);
  const launch = valid.metrics.find(metric => metric.id === 'app_launch_seconds')!;
  assert.equal(launch.pairs, 1);
  assert.equal(launch.improved, 1);
});

test('unavailable historical rule vocabulary suppresses checklist coverage instead of using current definitions', () => {
  for (const ruleVersion of ['unknown-version', '1.0.0', '1.0.1', '']) {
    const result = summarizeWorkspaceMetrics([
      fixture('current', { answers: performanceAnswers }),
      fixture('historical', { answers: performanceAnswers, ruleVersion }),
    ]);
    assert.equal(result.coverageAvailable, false);
    assert.equal(result.completedCases, 0);
    assert.equal(result.usableChecks, 0);
    assert.equal(result.totalChecks, 0);
    assert.equal(result.caseCount, 2);
  }
});

test('repeated case IDs count once using their latest saved state', () => {
  const earlier = fixture('same', { status: 'resolved', answers: performanceAnswers });
  const later = fixture('same', { status: 'escalated', updatedAt: '2026-10-15T13:00:00.000Z' });
  for (const records of [[earlier, later], [later, earlier]]) {
    const result = summarizeWorkspaceMetrics(records);
    assert.equal(result.caseCount, 1);
    assert.equal(result.resolvedCases, 0);
    assert.equal(result.escalatedCases, 1);
    assert.equal(result.completedCases, 0);
  }
});
