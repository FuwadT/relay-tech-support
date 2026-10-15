import type { CaseRecord, Category } from './contracts';
import { compareMeasurements, DIAGNOSTIC_RULE_VERSION, getChecks, getMeasurementDefinitions } from './diagnostics';

export interface WorkspaceMetric {
  id: string;
  label: string;
  unit: string;
  category: Category;
  pairs: number;
  improved: number;
}

// The caller supplies an authorized, disclosed population and displays data
// loading/error state, reporting cutoff, truncation and per-metric coverage.
export function summarizeWorkspaceMetrics(records: CaseRecord[]) {
  // List merges can repeat IDs. Count each current record once, keeping the
  // latest saved state rather than treating an earlier snapshot as another case.
  const distinct = new Map<string, CaseRecord>();
  for (const record of records) {
    const prior = distinct.get(record.id);
    if (!prior || record.updatedAt > prior.updatedAt) distinct.set(record.id, record);
  }
  const cohort = [...distinct.values()];
  const coverageAvailable = cohort.every(record => record.ruleVersion === DIAGNOSTIC_RULE_VERSION);
  let completedCases = 0;
  let usableChecks = 0;
  let totalChecks = 0;
  if (coverageAvailable) {
    for (const record of cohort) {
      const checks = getChecks(record.category);
      totalChecks += checks.length;
      const recognized = checks.filter(check => check.options.some(option => option.value === record.answers?.[check.id]));
      if (recognized.length === checks.length) completedCases++;
      usableChecks += recognized.filter(check => !['unknown', 'not_tried'].includes(record.answers[check.id])).length;
    }
  }

  const metrics: WorkspaceMetric[] = (['performance', 'network'] as Category[]).flatMap(category =>
    getMeasurementDefinitions(category).map(definition => ({
      id: definition.id, label: definition.label, unit: definition.unit, category, pairs: 0, improved: 0,
    })));
  for (const record of cohort) {
    for (const comparison of compareMeasurements(record.category, record.measurements)) {
      if (comparison.direction === 'incomplete') continue;
      const metric = metrics.find(item => item.category === record.category && item.id === comparison.id)!;
      metric.pairs++;
      if (comparison.direction === 'improved') metric.improved++;
    }
  }
  return {
    caseCount: cohort.length, completedCases, usableChecks, totalChecks,
    resolvedCases: cohort.filter(record => record.status === 'resolved').length,
    escalatedCases: cohort.filter(record => record.status === 'escalated').length,
    coverageAvailable, metrics,
  };
}
