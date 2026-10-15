import type { Analysis, CaseMeasurements, CaseRecord, Category, DiagnosticCheck, MeasurementComparison, MeasurementDefinition } from './contracts';

export const DIAGNOSTIC_RULE_VERSION = '1.0.2';

// Old cases without a snapshot are explicitly evaluated using current rules.
export function caseAnalysis(record: CaseRecord): Analysis {
  return record.analysisSnapshot ?? analyzeCase(record);
}

const unknown = { value: 'unknown', label: 'Not sure / unable to check' };

export const measurementDefinitions: Record<Category, MeasurementDefinition[]> = {
  performance: [
    { id: 'app_launch_seconds', label: 'App launch time', unit: 'sec', instruction: 'Time how long your most frequently used app takes to fully open and become responsive.', min: 0, max: 600 },
    { id: 'cpu_percent', label: 'CPU utilization', unit: '%', instruction: 'In Task Manager (Ctrl+Shift+Esc), check overall CPU percentage during normal use.', min: 0, max: 100 },
    { id: 'memory_percent', label: 'Memory utilization', unit: '%', instruction: 'In Task Manager, check overall Memory percentage during normal use.', min: 0, max: 100 },
    { id: 'free_storage_gb', label: 'System drive free space', unit: 'GB', instruction: 'In Settings → System → Storage, record free gigabytes remaining on Drive C:.', min: 0, max: 50000 },
  ],
  network: [
    { id: 'download_mbps', label: 'Download speed', unit: 'Mbps', instruction: 'Run an internet speed test (e.g. speedtest.net or fast.com) and record download speed.', min: 0, max: 10000 },
    { id: 'upload_mbps', label: 'Upload speed', unit: 'Mbps', instruction: 'Record the upload speed from the same test.', min: 0, max: 10000 },
    { id: 'ping_latency_ms', label: 'Ping latency', unit: 'ms', instruction: 'Record the unloaded latency or ping time in milliseconds.', min: 0, max: 5000 },
    { id: 'wifi_bars', label: 'Wi-Fi signal strength', unit: 'bars', instruction: 'Count how many bars are illuminated on the Windows taskbar Wi-Fi icon.', min: 1, max: 4 },
  ],
};

export function getMeasurementDefinitions(category: Category): MeasurementDefinition[] {
  return measurementDefinitions[category];
}

export function compareMeasurements(category: Category, measurements?: CaseMeasurements): MeasurementComparison[] {
  const defs = getMeasurementDefinitions(category);
  const baseline = measurements?.baseline ?? {};
  const followUp = measurements?.followUp ?? {};

  return defs.map(def => {
    // Historical data can predate server validation. Invalid readings remain
    // unknown rather than creating a misleading comparison or NaN difference.
    const validReading = (value: unknown): value is number => typeof value === 'number'
      && Number.isFinite(value)
      && (def.min === undefined || value >= def.min)
      && (def.max === undefined || value <= def.max);
    const bVal = validReading(baseline[def.id]) ? baseline[def.id] as number : null;
    const fVal = validReading(followUp[def.id]) ? followUp[def.id] as number : null;

    if (bVal === null || fVal === null) {
      return {
        id: def.id,
        label: def.label,
        unit: def.unit,
        baseline: bVal,
        followUp: fVal,
        difference: null,
        direction: 'incomplete',
      };
    }

    // Avoid floating-point display noise without rounding real sub-0.1 changes
    // to zero. Direction describes the metric, never proof of a repair.
    const diff = Number((fVal - bVal).toPrecision(12));
    let direction: 'improved' | 'worsened' | 'unchanged' = 'unchanged';
    const lowerIsBetter = ['app_launch_seconds', 'cpu_percent', 'memory_percent', 'ping_latency_ms'].includes(def.id);

    if (diff === 0) {
      direction = 'unchanged';
    } else if (lowerIsBetter) {
      direction = diff < 0 ? 'improved' : 'worsened';
    } else {
      direction = diff > 0 ? 'improved' : 'worsened';
    }

    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      baseline: bVal,
      followUp: fVal,
      difference: diff,
      direction,
    };
  });
}

const checks: Record<Category, DiagnosticCheck[]> = {
  performance: [
    { id: 'scope', title: 'Where does the slowdown happen?', instruction: 'Compare an ordinary browser tab with another app you already use. Do not install anything.', reason: 'This separates an app-specific symptom from a broader device problem.', options: [{value:'one_app',label:'Only one app'}, {value:'whole_device',label:'Across several apps'}, unknown] },
    { id: 'resources', title: 'Observe Task Manager', instruction: 'Press Ctrl + Shift + Esc. While the slowdown is happening, look at CPU, Memory, and Disk in Task Manager. Choose the clearest sustained pattern; do not end processes.', reason: 'A sustained high reading can suggest resource pressure, but does not establish its cause.', options: [{value:'cpu',label:'CPU stays above about 90%'},{value:'memory',label:'Memory stays above about 90%'},{value:'disk',label:'Disk stays near 100%'},{value:'normal',label:'None stays very high'},unknown] },
    { id: 'storage', title: 'Check available storage', instruction: 'Open Settings → System → Storage and inspect the system drive. Do not delete files.', reason: 'Very little free space can contribute to slowdowns.', options: [{value:'low',label:'Less than about 10% free'},{value:'enough',label:'At least about 10% free'},unknown] },
    { id: 'restart', title: 'Compare after a normal restart', instruction: 'Save your work. If convenient, restart from Start → Power → Restart and repeat the same ordinary activity. Skip if an update or other work must finish.', reason: 'A repeatable comparison helps distinguish temporary behavior from a persistent symptom.', options: [{value:'better',label:'Noticeably better'},{value:'same',label:'Same or worse'},{value:'not_tried',label:'Not tried yet'},unknown] },
  ],
  network: [
    { id:'scope', title:'Check another device', instruction:'On another device connected to the same Wi-Fi, try opening the same ordinary website. Mobile data must be off for a useful comparison.', reason:'A shared symptom suggests checking the local network or provider before changing one computer.', options:[{value:'one_device',label:'Only this computer is affected'},{value:'all_devices',label:'Multiple devices are affected'},unknown]},
    { id:'connection', title:'Compare connection location', instruction:'If practical, move closer to your router and repeat the same activity. If already connected by Ethernet, select that option. Do not move equipment unsafely.', reason:'A location-dependent change can suggest Wi-Fi signal or interference issues.', options:[{value:'better_near',label:'Better closer to the router'},{value:'same_near',label:'No improvement closer by'},{value:'wired',label:'Already using Ethernet'},unknown]},
    { id:'activity', title:'Check background network activity', instruction:'Look for downloads, cloud backups, game updates, or video streams on your own devices. Pause only an activity you recognize and can safely resume, then compare.', reason:'Concurrent traffic can affect responsiveness even when the connection has adequate advertised speed.', options:[{value:'better_paused',label:'Improved when activity paused'},{value:'same',label:'No change / no heavy activity'},{value:'not_tried',label:'Not tried'},unknown]},
    { id:'reach', title:'Compare different services', instruction:'Try two unrelated websites or apps you normally use. Note whether the problem is limited to one service.', reason:'A single-service issue may need application or service-specific support.', options:[{value:'one_service',label:'Only one service fails'},{value:'many_services',label:'Several services are affected'},unknown]},
  ],
};
export function getChecks(category: Category): DiagnosticCheck[] { return checks[category]; }
export function analyzeCase(record: Pick<CaseRecord, 'category' | 'answers'> & { measurements?: CaseMeasurements; ruleVersion?: string }): Analysis {
  const a = record.answers;
  const findings: string[] = [];
  const nextSteps: string[] = [];
  const evidenceUsed: string[] = [];

  const allowedChecks = getChecks(record.category);
  const allowedMeasurements = getMeasurementDefinitions(record.category);
  const usableAnswer = (key: string, value: string) => !['unknown', 'not_tried'].includes(value)
    && allowedChecks.some(check => check.id === key && check.options.some(option => option.value === value));
  const usableMeasurement = (key: string, value: unknown) => typeof value === 'number'
    && Number.isFinite(value)
    && allowedMeasurements.some(def => def.id === key
      && (def.min === undefined || value >= def.min)
      && (def.max === undefined || value <= def.max));
  for (const [k, v] of Object.entries(a)) {
    if (usableAnswer(k, v)) {
      evidenceUsed.push(`${k}:${v}`);
    }
  }

  if (record.measurements?.baseline) {
    for (const [k, v] of Object.entries(record.measurements.baseline)) {
      if (usableMeasurement(k, v)) evidenceUsed.push(`baseline_${k}:${v}`);
    }
  }
  if (record.measurements?.followUp) {
    for (const [k, v] of Object.entries(record.measurements.followUp)) {
      if (usableMeasurement(k, v)) evidenceUsed.push(`followup_${k}:${v}`);
    }
  }

  if (record.category === 'performance') {
    if (a.scope === 'one_app') { findings.push('You reported that the slowdown is limited to one app.'); nextSteps.push('Check that app’s official support and update guidance; compare with the same task in another app if possible.'); }
    if (['cpu','memory','disk'].includes(a.resources)) { findings.push(`You observed sustained high ${a.resources === 'cpu' ? 'CPU' : a.resources} usage during the symptom.`); nextSteps.push('Record the name of the busiest recognizable app in Task Manager and repeat the observation. Do not stop unfamiliar system processes.'); }
    if (a.storage === 'low') { findings.push('You reported less than about 10% free space on the system drive.'); nextSteps.push('Review Windows Storage recommendations and back up important files before considering any cleanup.'); }
    if (a.restart === 'better') { findings.push('You reported improvement after a restart; this does not establish the original cause.'); nextSteps.push('Repeat the same activity later and record whether the symptom returns before marking the case resolved.'); }
    if (a.restart === 'same') nextSteps.push('If the symptom persists, share this case with a trusted technician or the device manufacturer.');

    // Contradictory / ambiguous checks (S3-06)
    if (a.scope === 'whole_device' && a.resources === 'normal' && a.storage === 'enough') {
      findings.push('You reported device-wide slowdown without sustained high resource usage or low storage. These observations do not identify a cause.');
      nextSteps.push('Repeat the same activity while the slowdown is happening and record its duration and Task Manager readings. If it persists, share the observations with a trusted technician.');
    }
    const highRecordedUsage = (['baseline', 'followUp'] as const).some(phase =>
      ['cpu_percent', 'memory_percent'].some(metric => {
        const value = record.measurements?.[phase]?.[metric];
        return typeof value === 'number' && Number.isFinite(value) && value > 90 && value <= 100;
      })
    );
    if (a.resources === 'normal' && highRecordedUsage) {
      findings.push('You selected no sustained high resource usage, but recorded a CPU or memory reading above 90%. The readings may describe different times or workloads; they do not establish a cause.');
      nextSteps.push('Compare the timing and workload of those readings with the Task Manager answer. Repeat the observation during the slowdown and correct either entry if needed.');
    }
  } else {
    if (a.scope === 'all_devices') { findings.push('You reported that multiple devices on the same Wi-Fi are affected.'); nextSteps.push('Check your provider’s official outage information and share the cross-device result with their support team.'); }
    if (a.scope === 'one_device') { findings.push('You reported that only this computer is affected.'); nextSteps.push('Record whether this computer behaves differently on another trusted network, if one is available.'); }
    if (a.connection === 'better_near') { findings.push('You reported improvement closer to the router, consistent with a possible Wi-Fi coverage or interference issue.'); nextSteps.push('Use a safe location with a clearer path to the router and repeat the same task before considering new hardware.'); }
    if (a.activity === 'better_paused') { findings.push('You reported improvement when background network activity was paused.'); nextSteps.push('Schedule your own downloads or backups outside calls and compare performance again.'); }
    if (a.reach === 'one_service') { findings.push('You reported that the problem is limited to one service.'); nextSteps.push('Check that service’s official status and support guidance before changing network settings.'); }

    // Contradictory / ambiguous checks (S3-06)
    if (a.connection === 'wired' && a.scope === 'all_devices') {
      findings.push('You reported multiple affected devices and Ethernet on this computer. This does not establish that the devices failed at the same time or identify a router or provider fault.');
      nextSteps.push('Compare the same two unrelated services on both devices at the same time. Record which connections and services fail before drawing a network-wide conclusion.');
    }
  }

  const completed = allowedChecks.filter(c => usableAnswer(c.id, a[c.id])).length;
  if (!findings.length) findings.push(completed ? 'The observations provided do not yet point to a specific explanation.' : 'No conclusive observations have been recorded yet.');
  if (!nextSteps.length) nextSteps.push('Complete the remaining checks and record a repeatable example. Escalate to a trusted technician if the issue continues.');

  const comparisons = compareMeasurements(record.category, record.measurements);

  return {
    headline: completed ? 'Your evidence, organized' : 'Start with a few observations',
    summary: `${completed} of ${getChecks(record.category).length} checks have usable observations. These suggestions come from fixed diagnostic rules.`,
    findings,
    nextSteps,
    limitations: [
      'Results use your reported observations; this app cannot inspect your device or verify a repair.',
      'These are possible explanations and next steps, not a confirmed root cause or an AI-generated diagnosis.',
      'Outcome comparisons display self-reported values and do not prove that an action caused the change.'
    ],
    ruleVersion: DIAGNOSTIC_RULE_VERSION,
    evidenceUsed,
    comparisons
  };
}
