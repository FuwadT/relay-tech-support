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

/** Safe CPU usage formatter avoiding bare '%' when unsampled or NaN. */
export function formatCpuUsage(cpuPercent?: number | null): string {
  if (typeof cpuPercent !== 'number' || Number.isNaN(cpuPercent)) {
    return 'Not sampled';
  }
  return `${Math.round(cpuPercent)}%`;
}

/** Safe memory formatter with clean percentages and rounded GB values. */
export function formatMemoryUsage(usedMb?: number | null, totalMb?: number | null): string {
  if (typeof usedMb !== 'number' || typeof totalMb !== 'number' || totalMb <= 0) {
    return 'Not sampled';
  }
  const pct = Math.round((usedMb / totalMb) * 100);
  const usedGb = (usedMb / 1024).toFixed(1);
  const totalGb = (totalMb / 1024).toFixed(1);
  return `${pct}% (${usedGb} / ${totalGb} GB)`;
}

/** Safe disk space formatter with rounded GB and percentage free. */
export function formatDiskFree(freeGb?: number | null, totalGb?: number | null): string {
  if (typeof freeGb !== 'number' || typeof totalGb !== 'number' || totalGb <= 0) {
    return 'Not sampled';
  }
  const freePct = Math.round((freeGb / totalGb) * 100);
  return `${freePct}% free (${Math.round(freeGb)} / ${Math.round(totalGb)} GB)`;
}

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

