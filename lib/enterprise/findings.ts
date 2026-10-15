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
