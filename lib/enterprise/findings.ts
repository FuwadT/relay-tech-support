import type { EvidenceFinding, TelemetrySnapshot } from './contracts';
import { validateTelemetrySnapshot } from './telemetry-validation';

const ruleVersion = 'enterprise-observations-1.0.0';

/** Observations only: no executable actions, rendered HTML, or inferred repair verification. */
export function analyzeEnterpriseTelemetry(snapshot: TelemetrySnapshot): EvidenceFinding[] {
  // Keep accidental callers outside the import boundary from manufacturing evidence.
  const parsed = validateTelemetrySnapshot(snapshot);
  if (!parsed.ok) return [{ id: 'invalid-snapshot', severity: 'info',
    observation: 'Telemetry input is invalid. Import a validated snapshot before interpreting readings.',
    hypothesis: null, evidenceIds: [], recommendedCheckIds: [], ruleVersion }];
  const value = parsed.value;
  const findings: EvidenceFinding[] = [];
  const source = value.source === 'synthetic'
    ? 'Synthetic demo data; these are not readings from a real device. '
    : value.source === 'user-reported'
      ? 'User-reported reading; not independently verified. '
      : 'Imported collector reading; collection conditions have not been independently verified. ';
  const conditions = ` Snapshot timestamp: ${value.collectedAt}. Sample interval: ${value.sampleIntervalMs === null ? 'unknown' : `${value.sampleIntervalMs} ms`}.`;
  function add(id: string, observation: string, evidenceIds: string[], hypothesis: string | null = null,
    severity: EvidenceFinding['severity'] = 'warning') {
    findings.push({ id, severity, observation: source + observation + conditions,
      hypothesis, evidenceIds, recommendedCheckIds: [], ruleVersion });
  }

  if (value.cpuPercent !== null) {
    if (value.sampleIntervalMs === null) add('cpu-sample-unknown',
      `CPU is recorded as ${value.cpuPercent}%, but its sample period is unknown. Do not treat it as sustained or comparable CPU usage; repeat with a known interval.`,
      ['/cpuPercent', '/sampleIntervalMs']);
    if (value.cpuPercent >= 85) add('cpu-high', `CPU is recorded as ${value.cpuPercent}% (threshold: 85%). Repeat during the reported symptom under the same workload.`,
      ['/cpuPercent', '/sampleIntervalMs'], 'Possible resource pressure; this reading does not identify a cause or establish persistence.');
  }
  if (value.memoryTotalMb !== null && value.memoryTotalMb > 0 && value.memoryUsedMb !== null) {
    const percent = value.memoryUsedMb / value.memoryTotalMb * 100;
    if (percent >= 90) add('memory-high', `Recorded memory use is ${value.memoryUsedMb} MB of ${value.memoryTotalMb} MB (${percent.toFixed(1)}%; threshold: 90%). Repeat during the symptom.`,
      ['/memoryUsedMb', '/memoryTotalMb'], 'Possible memory pressure; one reading does not establish a leak or its cause.');
  }
  if (value.diskTotalGb !== null && value.diskTotalGb > 0 && value.diskFreeGb !== null) {
    const percent = value.diskFreeGb / value.diskTotalGb * 100;
    if (percent <= 10) add('disk-free-low', `Recorded free storage is ${value.diskFreeGb} GB of ${value.diskTotalGb} GB (${percent.toFixed(1)}% free; threshold: 10%). Confirm which volume was measured.`,
      ['/diskFreeGb', '/diskTotalGb'], 'Possible storage constraint; the reading does not prove the cause of the reported symptom.');
  }
  if (value.dnsResolved === false) add('dns-unsuccessful',
    'The DNS check is recorded as unsuccessful. Recheck the same target and another unrelated target; the snapshot does not identify the target or failure reason.',
    ['/dnsResolved'], 'Possible name-resolution difficulty; a resolver fault, adapter fault or service outage is not confirmed.');
  if (value.gatewayLatencyMs !== null && value.gatewayLatencyMs >= 100) add('gateway-latency-high',
    `Gateway latency is recorded as ${value.gatewayLatencyMs} ms (threshold: 100 ms). Confirm the target is the actual gateway and repeat under matching conditions.`,
    ['/gatewayLatencyMs'], 'Possible local-link delay; the target, repeated latency and cause require verification.');

  // Contradictions are requests to recheck, never evidence for a specific defect.
  value.processes.forEach((process, index) => {
    if (value.cpuPercent !== null && process.cpuPercent !== null && process.cpuPercent > value.cpuPercent) add(
      `process-cpu-recheck-${index}`, `Process PID ${process.pid} is recorded at ${process.cpuPercent}% CPU, above total CPU ${value.cpuPercent}%. Recheck normalization and whether both readings describe the same interval.`,
      [`/processes/${index}/pid`, `/processes/${index}/cpuPercent`, '/cpuPercent', '/sampleIntervalMs']);
    if (value.memoryTotalMb !== null && process.memoryMb !== null && process.memoryMb > value.memoryTotalMb) add(
      `process-memory-recheck-${index}`, `Process PID ${process.pid} is recorded using ${process.memoryMb} MB, above total memory ${value.memoryTotalMb} MB. Recheck measurement definitions, units and collection times.`,
      [`/processes/${index}/pid`, `/processes/${index}/memoryMb`, '/memoryTotalMb']);
  });
  const known = ['/cpuPercent', '/memoryTotalMb', '/memoryUsedMb', '/diskTotalGb', '/diskFreeGb', '/dnsResolved', '/gatewayLatencyMs']
    .filter(field => value[field.slice(1) as keyof TelemetrySnapshot] !== null);
  if (findings.length === 0) add('more-evidence', known.length === 0
    ? 'No usable summary readings are available. Gather a comparable snapshot during the symptom; missing values remain unknown.'
    : 'The available summary readings do not cross these review thresholds. Missing readings remain unknown. Repeat during the symptom before narrowing an explanation; this is not a clean bill of health.',
  known, null, 'info');
  return findings;
}

import {
  formatCpuUsage,
  formatMemoryUsage,
  formatDiskFree,
} from '../formatters';

export {
  formatCpuUsage,
  formatMemoryUsage,
  formatDiskFree,
};

/**
 * Symptom-aware diagnostic explanation reconciling user-reported symptoms
 * with collected telemetry findings (Fix 5).
 */
export function generateSymptomAwareExplanation(
  symptomCategory: string,
  snapshot: TelemetrySnapshot,
  findings: EvidenceFinding[],
): string {
  const isCpuSymptom = symptomCategory.toLowerCase().includes('cpu') ||
    symptomCategory.toLowerCase().includes('fan') ||
    symptomCategory.toLowerCase().includes('perf');

  const hasCpuSpike = typeof snapshot.cpuPercent === 'number' && snapshot.cpuPercent >= 75;
  const dnsFailed = snapshot.dnsResolved === false;
  const diskLow = findings.some((f) => f.id === 'disk-free-low');

  if (isCpuSymptom && !hasCpuSpike) {
    if (dnsFailed) {
      return `Note: You reported **high CPU utilization and loud fan noise**, but this telemetry sample did not capture a CPU spike (CPU reading was ${
        snapshot.cpuPercent === null ? 'not sampled' : `normal at ${Math.round(snapshot.cpuPercent)}%`
      }). However, it did detect a **DNS resolution failure** (\`catalog-net-flush-dns\`). Would you like to run the **High CPU** check to investigate your fan noise, or fix the DNS issue first?`;
    }
    if (diskLow) {
      return `Note: You reported **high CPU utilization and loud fan noise**, but this telemetry sample showed ${
        snapshot.cpuPercent === null ? 'CPU was not sampled' : `CPU was normal at ${Math.round(snapshot.cpuPercent)}%`
      }. It did detect **low disk storage** (${formatDiskFree(snapshot.diskFreeGb, snapshot.diskTotalGb)}). Low disk space can lead to swap thrashing and fan activity.`;
    }
  }

  if (findings.length > 0) {
    const primary = findings[0];
    return `Analysis complete. Based on ${findings.length} evidence-linked observation(s), the primary factor is **${primary.id}**: ${primary.observation}`;
  }

  return 'Analysis complete. All collected metrics are within normal operating parameters. Ongoing monitoring is recommended.';
}

/**
 * Answers conversational follow-up questions from the active telemetry snapshot (Fix 1).
 */
export function explainTelemetryQuestion(
  question: string,
  snapshot: TelemetrySnapshot,
  findings: EvidenceFinding[],
  symptomCategory: string = 'general',
): string {
  const q = question.toLowerCase();

  if (q.includes('cpu') || q.includes('fan') || q.includes('heat') || q.includes('freeze') || q.includes('noise')) {
    if (typeof snapshot.cpuPercent === 'number') {
      const topProcs = snapshot.processes.slice(0, 3).map((p) => `${p.name} (${p.cpuPercent ?? 0}%)`).join(', ');
      return `Your latest telemetry shows CPU usage at **${formatCpuUsage(snapshot.cpuPercent)}** and memory at **${formatMemoryUsage(snapshot.memoryUsedMb, snapshot.memoryTotalMb)}**. ${
        snapshot.cpuPercent >= 75
          ? `High CPU usage was confirmed. Top active processes: ${topProcs || 'none recorded'}.`
          : `CPU usage was not elevated during this measurement. Fan noise may be related to periodic background bursts, GPU workload, or thermal ventilation.`
      }`;
    }
    return `Your last snapshot captured memory (${formatMemoryUsage(snapshot.memoryUsedMb, snapshot.memoryTotalMb)}) and DNS status (${
      snapshot.dnsResolved === null ? 'Not checked' : snapshot.dnsResolved ? 'Working' : 'Failed'
    }), but didn't include a live CPU percentage sample. Since your primary symptom is loud fan noise and freezing, let's trigger a High-CPU sample or inspect your top processes.`;
  }

  if (q.includes('memory') || q.includes('ram')) {
    const memFormatted = formatMemoryUsage(snapshot.memoryUsedMb, snapshot.memoryTotalMb);
    const memHigh = findings.some((f) => f.id === 'memory-high');
    return `Your latest telemetry shows memory usage at **${memFormatted}**. ${
      memHigh
        ? 'High memory pressure detected. Applications may experience slowdowns or memory exhaustion.'
        : 'Memory usage is currently within comfortable operating limits.'
    }`;
  }

  if (q.includes('disk') || q.includes('storage') || q.includes('space') || q.includes('drive')) {
    const diskFormatted = formatDiskFree(snapshot.diskFreeGb, snapshot.diskTotalGb);
    const diskLow = findings.some((f) => f.id === 'disk-free-low');
    return `Your device storage partition shows **${diskFormatted}**. ${
      diskLow ? 'Available storage is low, which can impede system caching and virtual memory.' : 'Storage headroom is sufficient.'
    }`;
  }

  if (q.includes('dns') || q.includes('wifi') || q.includes('network') || q.includes('internet') || q.includes('connect')) {
    return `Your network check shows DNS resolution is **${
      snapshot.dnsResolved === null ? 'Not sampled' : snapshot.dnsResolved ? 'Operating normally' : 'Failing'
    }** with gateway latency of **${
      snapshot.gatewayLatencyMs !== null ? `${snapshot.gatewayLatencyMs} ms` : 'Not sampled'
    }**.`;
  }

  // General grounded summary
  const cpuStr = formatCpuUsage(snapshot.cpuPercent);
  const memStr = formatMemoryUsage(snapshot.memoryUsedMb, snapshot.memoryTotalMb);
  const diskStr = formatDiskFree(snapshot.diskFreeGb, snapshot.diskTotalGb);
  const dnsStr = snapshot.dnsResolved === null ? 'Not sampled' : snapshot.dnsResolved ? 'Healthy' : 'Failing';

  return `Here is your current device telemetry status:
- **CPU Usage:** ${cpuStr}
- **Memory Used:** ${memStr}
- **Disk Free:** ${diskStr}
- **DNS Resolution:** ${dnsStr}

${findings.length > 0 ? `Identified findings: ${findings.map((f) => f.id).join(', ')}.` : 'No critical thresholds exceeded.'}`;
}


/**
 * Compares before/after TelemetrySnapshot to verify a remediation action improved system health.
 * Returns one diff entry per metric that has readings in both snapshots.
 */
export interface RemediationDiff {
  /** Camel-case field name on TelemetrySnapshot, e.g. "cpuPercent". */
  metric: string;
  before: number;
  after: number;
  /** True when the after value is meaningfully better than the before value. */
  improved: boolean;
  /** Human-readable badge, e.g. "CPU ↓ 91% → 12% ✅" */
  badge: string;
}

export function verifyRemediationDelta(
  before: TelemetrySnapshot,
  after: TelemetrySnapshot,
): RemediationDiff[] {
  const diffs: RemediationDiff[] = [];

  // CPU: improved when after drops by more than 5 percentage points
  if (before.cpuPercent !== null && after.cpuPercent !== null) {
    const improved = after.cpuPercent < before.cpuPercent - 5;
    const arrow = after.cpuPercent < before.cpuPercent ? '↓' : '↑';
    diffs.push({
      metric: 'cpuPercent',
      before: before.cpuPercent,
      after: after.cpuPercent,
      improved,
      badge: `CPU ${arrow} ${Math.round(before.cpuPercent)}% → ${Math.round(after.cpuPercent)}% ${improved ? '✅' : '⚠️'}`,
    });
  }

  // Memory: improved when after drops by more than 50 MB
  if (before.memoryUsedMb !== null && after.memoryUsedMb !== null) {
    const improved = after.memoryUsedMb < before.memoryUsedMb - 50;
    const arrow = after.memoryUsedMb < before.memoryUsedMb ? '↓' : '↑';
    const bGb = (before.memoryUsedMb / 1024).toFixed(1);
    const aGb = (after.memoryUsedMb / 1024).toFixed(1);
    diffs.push({
      metric: 'memoryUsedMb',
      before: before.memoryUsedMb,
      after: after.memoryUsedMb,
      improved,
      badge: `Memory ${arrow} ${bGb} GB → ${aGb} GB ${improved ? '✅' : '⚠️'}`,
    });
  }

  // Disk free: improved when after increases by more than 0.05 GB
  if (before.diskFreeGb !== null && after.diskFreeGb !== null) {
    const improved = after.diskFreeGb > before.diskFreeGb + 0.05;
    const arrow = after.diskFreeGb > before.diskFreeGb ? '↑' : '↓';
    diffs.push({
      metric: 'diskFreeGb',
      before: before.diskFreeGb,
      after: after.diskFreeGb,
      improved,
      badge: `Disk Free ${arrow} ${before.diskFreeGb.toFixed(1)} GB → ${after.diskFreeGb.toFixed(1)} GB ${improved ? '✅' : '⚠️'}`,
    });
  }

  // Gateway / DNS latency: improved when after is defined and drops by more than 20%
  const beforeDns = (before as { dnsLatencyMs?: number | null }).dnsLatencyMs;
  const afterDns = (after as { dnsLatencyMs?: number | null }).dnsLatencyMs;
  if (typeof beforeDns === 'number' && typeof afterDns === 'number') {
    const improved = afterDns < beforeDns * 0.8;
    const arrow = afterDns < beforeDns ? '↓' : '↑';
    diffs.push({
      metric: 'dnsLatencyMs',
      before: beforeDns,
      after: afterDns,
      improved,
      badge: `DNS ${arrow} ${beforeDns} ms → ${afterDns} ms ${improved ? '✅' : '⚠️'}`,
    });
  } else if (before.gatewayLatencyMs !== null && after.gatewayLatencyMs !== null) {
    const improved = after.gatewayLatencyMs < before.gatewayLatencyMs * 0.8;
    const arrow = after.gatewayLatencyMs < before.gatewayLatencyMs ? '↓' : '↑';
    diffs.push({
      metric: 'gatewayLatencyMs',
      before: before.gatewayLatencyMs,
      after: after.gatewayLatencyMs,
      improved,
      badge: `Gateway Latency ${arrow} ${before.gatewayLatencyMs} ms → ${after.gatewayLatencyMs} ms ${improved ? '✅' : '⚠️'}`,
    });
  }

  return diffs;
}
