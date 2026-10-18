import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyRemediationDelta } from '../lib/enterprise/findings';
import type { TelemetrySnapshot } from '../lib/enterprise/contracts';
import type { RateLimitStore } from '../lib/rate-limit';

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
    cpuPercent: 90,
    memoryTotalMb: 16384,
    memoryUsedMb: 14000,
    diskTotalGb: 512,
    diskFreeGb: 10,
    dnsResolved: true,
    gatewayLatencyMs: 100,
    processes: [],
    eventExcerpts: [],
    errors: [],
    ...overrides,
  };
}

test('verifyRemediationDelta flags CPU improvement when dropped by >5%', () => {
  const before = sampleSnapshot({ cpuPercent: 92 });
  const after = sampleSnapshot({ cpuPercent: 20 });
  const diffs = verifyRemediationDelta(before, after);

  const cpuDiff = diffs.find((d) => d.metric === 'cpuPercent');
  assert.ok(cpuDiff, 'Should contain cpuPercent metric');
  assert.equal(cpuDiff.improved, true);
  assert.ok(cpuDiff.badge.includes('✅'));
  assert.ok(cpuDiff.badge.includes('92% → 20%'));
});

test('verifyRemediationDelta flags CPU not improved when drop is <= 5%', () => {
  const before = sampleSnapshot({ cpuPercent: 80 });
  const after = sampleSnapshot({ cpuPercent: 78 });
  const diffs = verifyRemediationDelta(before, after);

  const cpuDiff = diffs.find((d) => d.metric === 'cpuPercent');
  assert.ok(cpuDiff);
  assert.equal(cpuDiff.improved, false);
  assert.ok(cpuDiff.badge.includes('⚠️'));
});

test('verifyRemediationDelta flags Memory improvement when dropped by >50 MB', () => {
  const before = sampleSnapshot({ memoryUsedMb: 12000 });
  const after = sampleSnapshot({ memoryUsedMb: 8000 });
  const diffs = verifyRemediationDelta(before, after);

  const memDiff = diffs.find((d) => d.metric === 'memoryUsedMb');
  assert.ok(memDiff);
  assert.equal(memDiff.improved, true);
  assert.ok(memDiff.badge.includes('✅'));
});

test('verifyRemediationDelta flags Disk Free improvement when increased by >0.05 GB', () => {
  const before = sampleSnapshot({ diskFreeGb: 5.0 });
  const after = sampleSnapshot({ diskFreeGb: 15.0 });
  const diffs = verifyRemediationDelta(before, after);

  const diskDiff = diffs.find((d) => d.metric === 'diskFreeGb');
  assert.ok(diskDiff);
  assert.equal(diskDiff.improved, true);
  assert.ok(diskDiff.badge.includes('✅'));
});

test('verifyRemediationDelta flags Gateway Latency improvement when reduced by >20%', () => {
  const before = sampleSnapshot({ gatewayLatencyMs: 100 });
  const after = sampleSnapshot({ gatewayLatencyMs: 50 });
  const diffs = verifyRemediationDelta(before, after);

  const latDiff = diffs.find((d) => d.metric === 'gatewayLatencyMs');
  assert.ok(latDiff);
  assert.equal(latDiff.improved, true);
  assert.ok(latDiff.badge.includes('✅'));
});

test('remediation catalog provides concrete user-space commands for all platforms', async () => {
  const { getRemediationCatalogItem, getRemediationCommand } = await import('../lib/enterprise/remediation-catalog');

  const dnsItem = getRemediationCatalogItem('catalog-net-flush-dns');
  assert.ok(dnsItem !== null);
  assert.equal(getRemediationCommand('catalog-net-flush-dns', 'windows11'), 'ipconfig /flushdns');
  assert.equal(getRemediationCommand('catalog-net-flush-dns', 'macos'), 'dscacheutil -flushcache');
  assert.ok(getRemediationCommand('catalog-net-flush-dns', 'ubuntu')?.includes('resolvectl'));

  const diskItem = getRemediationCatalogItem('catalog-disk-clear-temp');
  assert.ok(diskItem !== null);
  assert.ok(getRemediationCommand('catalog-disk-clear-temp', 'windows11')?.includes('$env:TEMP'));

  const cpuItem = getRemediationCatalogItem('catalog-cpu-inspect-top');
  assert.ok(cpuItem !== null);
  assert.ok(getRemediationCommand('catalog-cpu-inspect-top', 'windows11')?.includes('Get-Process'));
});

test('checkRateLimit supports custom RateLimitStore adapter and bounded capacity', async () => {
  const { checkRateLimit } = await import('../lib/rate-limit');

  const customMap = new Map<string, number[]>();
  const mockStore: RateLimitStore = {
    get: (key) => customMap.get(key),
    put: (key, timestamps) => {
      customMap.set(key, timestamps);
    },
  };

  const res1 = checkRateLimit('test-key', { windowMs: 1000, maxRequests: 2 }, mockStore);
  assert.equal(res1.allowed, true);
  assert.equal(res1.remaining, 1);
  assert.ok(customMap.has('test-key'));

  const res2 = checkRateLimit('test-key', { windowMs: 1000, maxRequests: 2 }, mockStore);
  assert.equal(res2.allowed, true);
  assert.equal(res2.remaining, 0);

  const res3 = checkRateLimit('test-key', { windowMs: 1000, maxRequests: 2 }, mockStore);
  assert.equal(res3.allowed, false);
});
