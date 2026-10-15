import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCase, compareMeasurements, getMeasurementDefinitions } from '../lib/diagnostics';
import type { CaseMeasurements, Category } from '../lib/contracts';

const categories: Category[] = ['performance', 'network'];

test('every metric keeps missing readings unknown while preserving permitted zero values', () => {
  for (const category of categories) {
    for (const def of getMeasurementDefinitions(category)) {
      const valid = def.min ?? 0;
      for (const absent of [undefined, null]) {
        const values = {
          baseline: { [def.id]: absent }, followUp: { [def.id]: valid },
        } as CaseMeasurements;
        const row = compareMeasurements(category, values).find(c => c.id === def.id)!;
        assert.equal(row.baseline, null, def.id);
        assert.equal(row.followUp, valid, def.id);
        assert.equal(row.difference, null, def.id);
        assert.equal(row.direction, 'incomplete', def.id);
      }
      if (valid === 0) {
        const row = compareMeasurements(category, {
          baseline: { [def.id]: 0 }, followUp: { [def.id]: 0 },
        }).find(c => c.id === def.id)!;
        assert.equal(row.baseline, 0, def.id);
        assert.equal(row.followUp, 0, def.id);
        assert.equal(row.direction, 'unchanged', def.id);
      }
    }
  }
});

test('invalid historical values in either phase never become measurement evidence', () => {
  for (const category of categories) {
    for (const def of getMeasurementDefinitions(category)) {
      const invalid: unknown[] = [NaN, Infinity, -Infinity, '', '12', true, {}, [],
        (def.min ?? 0) - 1, (def.max ?? Number.MAX_VALUE) + 1];
      for (const phase of ['baseline', 'followUp'] as const) {
        for (const value of invalid) {
          const measurements = { [phase]: { [def.id]: value } } as CaseMeasurements;
          const result = analyzeCase({ category, answers: {}, measurements });
          assert.deepEqual(result.evidenceUsed, [], `${category}/${def.id}/${phase}/${String(value)}`);
          const row = result.comparisons!.find(c => c.id === def.id)!;
          assert.equal(row.baseline, null);
          assert.equal(row.followUp, null);
          assert.equal(row.direction, 'incomplete');
        }
      }
    }
  }
});

test('comparison direction follows each metric and reverses with a reversed observation pair', () => {
  const lowerIsBetter = new Set(['app_launch_seconds', 'cpu_percent', 'memory_percent', 'ping_latency_ms']);
  for (const category of categories) {
    for (const def of getMeasurementDefinitions(category)) {
      const low = def.min ?? 0;
      const high = Math.min(low + 1, def.max ?? low + 1);
      const inputs = { baseline: { [def.id]: low }, followUp: { [def.id]: high } };
      const original = JSON.stringify(inputs);
      const forward = compareMeasurements(category, inputs).find(c => c.id === def.id)!;
      const reverse = compareMeasurements(category, { baseline: inputs.followUp, followUp: inputs.baseline }).find(c => c.id === def.id)!;
      assert.equal(forward.direction, lowerIsBetter.has(def.id) ? 'worsened' : 'improved', def.id);
      assert.equal(reverse.direction, lowerIsBetter.has(def.id) ? 'improved' : 'worsened', def.id);
      assert.ok(reverse.difference !== null, def.id);
      assert.equal(forward.difference, -reverse.difference, def.id);
      assert.equal(forward.unit, def.unit, def.id);
      assert.equal(JSON.stringify(inputs), original, 'Comparison must not rewrite entered observations');
    }
  }
});
