import type {
  Category,
  ChatMessage,
  DiagnosticArtifact,
  ProposedFix,
  SupportedOS,
  SystemTelemetry,
} from './contracts';
import { buildDiagnosticArtifactHtml } from './diagnostic-artifact';

export interface PromptEvaluationResult {
  canResolveZeroInstall: boolean;
  category: Category;
  severity: 'critical' | 'warning' | 'info';
  detectedKeywords: string[];
  conversationalResponse: string;
  quickFixSteps?: string[];
  investigationPlan?: {
    title: string;
    reasoning: string;
    checksToPerform: string[];
  };
}

/**
 * Evaluates the user's plain-language description.
 * Determines if the issue can be resolved with zero installation ("Bigger Win")
 * or requires deep OS-level telemetric investigation.
 */
export function evaluateUserPrompt(prompt: string): PromptEvaluationResult {
  const p = prompt.toLowerCase();

  // Pattern A: Zero-install software / browser / settings resolutions
  const zeroInstallMatches = [
    {
      keywords: ['clear cache', 'browser cookies', 'chrome slow', 'website not loading', 'refresh page'],
      response: `I've evaluated your issue! This is likely a localized browser cache or cookie conflict that can be resolved immediately **without downloading any software**:\n\n1. **Hard Refresh**: Press \`Ctrl + F5\` (Windows) or \`Cmd + Shift + R\` (Mac) on the problematic webpage.\n2. **Clear Cache**: In Chrome/Edge/Firefox, open Settings > Privacy & Security > Clear browsing data (choose 'Cached images and files').\n3. **Disable Conflicting Extensions**: Open Incognito / Private window to check if an ad-blocker or extension is interfering.\n\nDid this resolve the issue, or would you like me to inspect your full device?`,
      steps: [
        'Press Ctrl+F5 or Cmd+Shift+R to hard refresh',
        'Clear cached images and files in browser settings',
        'Test in Incognito/Private mode to rule out extension conflicts',
      ],
    },
    {
      keywords: ['microphone', 'mic not working', 'camera permission', 'webcam not showing', 'sound muted'],
      response: `I can help you fix this immediately **without any installation**:\n\n1. **App Permissions**: Go to your OS Settings > Privacy & Security > Microphone / Camera and verify that permission is toggled **ON** for your browser or app.\n2. **Hardware Mute**: Check your headset or keyboard function key (e.g. \`F4\` or physical switch) to ensure physical mute is disabled.\n3. **Default Device**: Open Sound Settings and ensure your desired headset or microphone is selected as the default input device.\n\nLet me know if this restored access, or if you need me to inspect your audio drivers!`,
      steps: [
        'Check OS Privacy Settings for Microphone/Camera permissions',
        'Verify hardware mute button or cable connection',
        'Set default input/output device in Sound Settings',
      ],
    },
    {
      keywords: ['shortcut', 'caps lock', 'keyboard typing wrong', 'numlock', 'fn key'],
      response: `This is a common configuration issue that we can resolve right here:\n\n1. **Check NumLock/FnLock**: Press \`NumLock\` or \`Fn + Esc\` to toggle function lock.\n2. **Keyboard Language**: Press \`Windows + Space\` or \`Ctrl + Space\` to ensure your keyboard layout didn't accidentally switch to a foreign layout.\n3. **Sticky Keys**: Press \`Shift\` 5 times quickly to verify Sticky Keys didn't get activated.\n\nDoes your keyboard work properly now?`,
      steps: [
        'Toggle NumLock or Fn+Esc key',
        'Check keyboard language layout (Win+Space)',
        'Check Sticky Keys settings in Accessibility',
      ],
    },
  ];

  for (const match of zeroInstallMatches) {
    const hits = match.keywords.filter((kw) => p.includes(kw));
    if (hits.length > 0) {
      return {
        canResolveZeroInstall: true,
        category: 'performance',
        severity: 'info',
        detectedKeywords: hits,
        conversationalResponse: match.response,
        quickFixSteps: match.steps,
      };
    }
  }

  // Pattern B: Deep System / OS Triage Required
  const isNetwork =
    p.includes('wifi') ||
    p.includes('wi-fi') ||
    p.includes('internet') ||
    p.includes('disconnect') ||
    p.includes('dns') ||
    p.includes('ping') ||
    p.includes('packet loss');

  const category: Category = isNetwork ? 'network' : 'performance';

  const planTitle = isNetwork
    ? 'Network Stack & Interface Investigation'
    : 'System Hardware & Process Telemetry Investigation';

  const reasoning = isNetwork
    ? 'Intermittent drops and connectivity failures usually stem from DNS resolver timeouts, stale adapter DHCP leases, or packet loss at the gateway. A read-only telemetry scan will inspect your active adapters, ping latencies, and DNS resolution health.'
    : 'System unresponsiveness, freezing, and high resource utilization typically originate from runaway background processes, memory pressure, or disk I/O bottlenecks. A read-only telemetry scan will inspect process CPU load, free memory, disk space, and recent critical event logs.';

  const checksToPerform = isNetwork
    ? [
        'Active network adapter state and IP assignment',
        'Gateway and WAN ping latency tests',
        'DNS resolution timing and server response',
        'Recent network adapter driver crash events',
      ]
    : [
        'Top 10 CPU-consuming processes and thread counts',
        'Physical RAM and paging file commit levels',
        'Storage volume capacity and temp directory bloating',
        'System event logs for service termination and kernel warnings',
      ];

  const conversationalResponse = `I've analyzed your description. Because this involves deeper OS-level symptoms (${isNetwork ? 'network adapter instability / connectivity' : 'hardware utilization and potential process freezing'}), I need to inspect your device telemetry.\n\nI have prepared a **safe, 1-time read-only diagnostic collector** for your computer. It runs non-destructive read commands across your CPU, processes, memory, and logs in a constrained environment—modifying zero files or settings. Choose your operating system below to begin.`;

  return {
    canResolveZeroInstall: false,
    category,
    severity: p.includes('freeze') || p.includes('crash') || p.includes('100%') ? 'critical' : 'warning',
    detectedKeywords: [isNetwork ? 'network' : 'system-performance'],
    conversationalResponse,
    investigationPlan: {
      title: planTitle,
      reasoning,
      checksToPerform,
    },
  };
}

export interface TelemetryAnalysisResult {
  defectTitle: string;
  rootCause: string;
  severity: 'critical' | 'warning' | 'info';
  evidence: string[];
  helpdeskNotes: string;
  proposedFix: ProposedFix;
  artifact: DiagnosticArtifact;
  conversationalSummary: string;
}

/**
 * Evaluates raw system telemetry against user symptoms to isolate the exact defect,
 * generate the standalone HTML artifact, and formulate the automated fix command.
 */
export function analyzeTelemetry(
  telemetry: SystemTelemetry,
  userPrompt: string,
  caseId: string
): TelemetryAnalysisResult {
  const os: SupportedOS = telemetry.os || 'windows';
  let defectTitle = 'Operational Inefficiency Detected';
  let rootCause = 'System resource metrics indicate abnormal background activity.';
  let severity: 'critical' | 'warning' | 'info' = 'warning';
  const evidence: string[] = [];
  let fixTitle = 'Optimize System Resources';
  let fixDesc = 'Clean background cache and restart stalled background tasks.';
  let fixCommand = '';
  let fixExplanation = '';
  let helpdeskNotes = '';

  const topCpuProcess = telemetry.topProcesses && telemetry.topProcesses[0];

  // Scenario 1: Critical High CPU / Runaway Process
  if (telemetry.cpuUsagePercent >= 80 || (topCpuProcess && topCpuProcess.cpuPercent >= 50)) {
    severity = 'critical';
    const procName = topCpuProcess ? topCpuProcess.name : 'Unknown Process';
    const procPid = topCpuProcess ? topCpuProcess.pid : 'N/A';
    const procCpu = topCpuProcess ? topCpuProcess.cpuPercent : telemetry.cpuUsagePercent;

    defectTitle = `Runaway Process (${procName}, PID ${procPid}) Consuming ${procCpu}% CPU`;
    rootCause = `The background process "${procName}" is locked in a high-iteration computational loop or corrupted thread cycle, monopolizing ${procCpu}% of CPU capacity and causing systemic UI freezes.`;

    evidence.push(`Overall CPU utilization measured at ${telemetry.cpuUsagePercent}%.`);
    evidence.push(`Top process: ${procName} (PID ${procPid}) actively consuming ${procCpu}% CPU and ${topCpuProcess?.memoryMb || 0} MB RAM.`);
    if (telemetry.systemErrors && telemetry.systemErrors.length > 0) {
      evidence.push(`Corroborating log: ${telemetry.systemErrors[0]}`);
    }

    helpdeskNotes = `CRITICAL TIER-1 ALERT: Systemic UI unresponsiveness reported by customer. Telemetry confirmed ${procName} (PID ${procPid}) pegged at ${procCpu}% CPU. Root cause: corrupted indexing/thread loop. Fix prepared to terminate hung PID and recycle service.`;

    fixTitle = `Terminate Hung Process (${procName}) and Reset Service`;
    fixDesc = `Safely stops the runaway process PID ${procPid} and restarts the underlying background service cleanly.`;

    if (os === 'windows') {
      fixCommand = `Stop-Process -Id ${procPid} -Force -ErrorAction SilentlyContinue; if (Get-Service WSearch -ErrorAction SilentlyContinue) { Restart-Service WSearch -Force }`;
      fixExplanation = `Terminates runaway PID ${procPid} (${procName}) and gracefully restarts the Windows Search index service to rebuild its cache without corrupt loops.`;
    } else if (os === 'macos') {
      fixCommand = `kill -9 ${procPid} 2>/dev/null || true; sudo mdutil -E / 2>/dev/null || true`;
      fixExplanation = `Terminates runaway PID ${procPid} and flushes the Spotlight search index cache to stop recursive metadata indexing.`;
    } else {
      fixCommand = `kill -15 ${procPid} 2>/dev/null || kill -9 ${procPid}; systemctl --user restart tracker-miner-fs-3 2>/dev/null || true`;
      fixExplanation = `Sends SIGTERM/SIGKILL to runaway PID ${procPid} and restarts the user space file indexing daemon.`;
    }
  }
  // Scenario 2: Storage Exhaustion / Disk Full (>90% full)
  else if (telemetry.diskUsagePercent >= 90 || telemetry.diskFreeGb <= 3) {
    severity = 'critical';
    defectTitle = `Severe Disk Space Starvation (${telemetry.diskUsagePercent}% Full, ${telemetry.diskFreeGb} GB Free)`;
    rootCause = `Primary storage volume has exceeded critical threshold. Lack of write buffer prevents operating system swap creation, temporary file allocation, and application updates.`;

    evidence.push(`Disk capacity: ${telemetry.diskTotalGb} GB total, only ${telemetry.diskFreeGb} GB free (${telemetry.diskUsagePercent}% utilized).`);
    if (telemetry.systemErrors && telemetry.systemErrors.length > 0) {
      evidence.push(`System Error: ${telemetry.systemErrors.find((e) => e.toLowerCase().includes('disk') || e.toLowerCase().includes('space')) || telemetry.systemErrors[0]}`);
    }

    helpdeskNotes = `TIER-1 ALERT: Disk volume has reached ${telemetry.diskUsagePercent}% saturation. System writes and swap files are currently failing. Automated cleanup proposed for temporary staging caches.`;

    fixTitle = 'Purge System Caches and Orphaned Update Logs';
    fixDesc = 'Reclaims emergency disk space by cleaning temporary staging files, update download logs, and empty recycle buffers.';

    if (os === 'windows') {
      fixCommand = `Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Dism.exe /online /Cleanup-Image /StartComponentCleanup /ResetBase`;
      fixExplanation = 'Clears Windows temporary user directories and executes DISM component store cleanup to purge superseded Windows update backups.';
    } else if (os === 'macos') {
      fixCommand = `sudo rm -rf /Library/Caches/* ~/Library/Caches/* /private/var/tmp/* 2>/dev/null || true`;
      fixExplanation = 'Clears stale macOS application cache files and purges legacy temporary build artifacts.';
    } else {
      fixCommand = `sudo journalctl --vacuum-time=2d; sudo apt-get clean 2>/dev/null || sudo dnf clean all 2>/dev/null; rm -rf /tmp/* 2>/dev/null || true`;
      fixExplanation = 'Trims systemd journal logs older than 2 days, clears package manager download caches, and purges /tmp/.';
    }
  }
  // Scenario 3: Network Adapter / DNS Resolution Failure
  else if (!telemetry.dnsWorking || !telemetry.networkConnected) {
    severity = 'critical';
    defectTitle = !telemetry.dnsWorking && telemetry.networkConnected
      ? 'Stagnant DNS Resolver / Stale Gateway Configuration'
      : 'Network Adapter Interface Disconnected';
    rootCause = !telemetry.dnsWorking && telemetry.networkConnected
      ? 'The local DNS resolver cache is returning NXDOMAIN or timing out due to corrupted socket state or outdated DHCP server leases.'
      : 'Hardware or virtual network interface failed to negotiate a valid physical link with the gateway router.';

    evidence.push(`Network connection ping: ${telemetry.networkConnected ? 'Successful (Gateway reachable)' : 'FAILED'}.`);
    evidence.push(`DNS resolution check (cloudflare.com): ${telemetry.dnsWorking ? 'Operational' : 'TIMED OUT / FAILED'}.`);
    if (telemetry.systemErrors && telemetry.systemErrors.length > 0) {
      evidence.push(`Log trace: ${telemetry.systemErrors[0]}`);
    }

    helpdeskNotes = `TIER-1 ALERT: Customer experiencing total or intermittent connectivity loss. Telemetry verified DNS resolution timeout while gateway is pingable. Network stack reset and DNS cache purge recommended.`;

    fixTitle = 'Flush DNS Cache & Reset Network Stack Sockets';
    fixDesc = 'Flushes stale DNS resolver records, releases/renews DHCP address leases, and resets TCP/IP sockets.';

    if (os === 'windows') {
      fixCommand = `ipconfig /flushdns; ipconfig /release; ipconfig /renew; netsh winsock reset`;
      fixExplanation = 'Flushes Windows DNS resolver entries, requests a fresh IP lease from the router, and resets Winsock catalog sockets to default state.';
    } else if (os === 'macos') {
      fixCommand = `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`;
      fixExplanation = 'Flushes DirectoryService cache and sends SIGHUP to mDNSResponder to reinitialize macOS domain resolution.';
    } else {
      fixCommand = `sudo resolvectl flush-caches 2>/dev/null || sudo systemd-resolve --flush-caches 2>/dev/null; sudo systemctl restart systemd-resolved 2>/dev/null || true`;
      fixExplanation = 'Flushes systemd-resolved DNS caches and restarts the local resolver service.';
    }
  }
  // Scenario 4: Severe Memory Leak (>85% memory used)
  else if (telemetry.memoryUsagePercent >= 85) {
    severity = 'warning';
    const topMemProcess = [...(telemetry.topProcesses || [])].sort((a, b) => b.memoryMb - a.memoryMb)[0];
    const procName = topMemProcess ? topMemProcess.name : 'System App';
    const procPid = topMemProcess ? topMemProcess.pid : 'N/A';
    const procMem = topMemProcess ? topMemProcess.memoryMb : Math.round(telemetry.memoryUsedMb);

    defectTitle = `High Memory Saturation (${telemetry.memoryUsagePercent}% Used): Leaking Process ${procName}`;
    rootCause = `Physical memory has reached ${telemetry.memoryUsagePercent}%, forcing the kernel to page memory to disk. Process "${procName}" (PID ${procPid}) is holding ${procMem} MB of unreleased memory.`;

    evidence.push(`Total memory consumed: ${telemetry.memoryUsedMb} MB of ${telemetry.memoryTotalMb} MB (${telemetry.memoryUsagePercent}%).`);
    evidence.push(`Top consumer: ${procName} (PID ${procPid}) holding ${procMem} MB.`);

    helpdeskNotes = `TIER-1 NOTE: Memory pressure detected at ${telemetry.memoryUsagePercent}%. Leaking process identified as ${procName}. Automated recycling script formulated.`;

    fixTitle = `Recycle Memory-Hogging Process (${procName})`;
    fixDesc = `Safely terminates process ${procName} to reclaim ${procMem} MB of RAM and restore paging buffer.`;

    if (os === 'windows') {
      fixCommand = `Stop-Process -Id ${procPid} -Force`;
      fixExplanation = `Terminates memory-leaking process ${procName} to immediately recover RAM.`;
    } else {
      fixCommand = `kill -15 ${procPid} 2>/dev/null || kill -9 ${procPid}`;
      fixExplanation = `Terminates process ${procName} to free system memory.`;
    }
  }
  // Scenario 5: General Healthy / Optimization Baseline
  else {
    severity = 'info';
    defectTitle = 'No Critical Hardware or Process Faults Detected';
    rootCause = `CPU (${telemetry.cpuUsagePercent}%), Memory (${telemetry.memoryUsagePercent}%), and Disk (${telemetry.diskUsagePercent}%) are operating within standard parameters. The reported symptom may be triggered by temporary application stalls or external network congestion.`;

    evidence.push(`CPU utilization healthy at ${telemetry.cpuUsagePercent}%.`);
    evidence.push(`Memory usage normal at ${telemetry.memoryUsagePercent}%.`);
    evidence.push(`Disk storage has ${telemetry.diskFreeGb} GB free.`);
    evidence.push(`Network ping and DNS checks passed successfully.`);

    helpdeskNotes = `TIER-1 NOTE: Baseline telemetry is nominal. No runaway PIDs or hardware bottlenecks detected. Standard disk/cache maintenance suggested.`;

    fixTitle = 'Run Routine Cache & Temp Maintenance';
    fixDesc = 'Performs routine system cache cleanup to maintain responsiveness.';

    if (os === 'windows') {
      fixCommand = `Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue`;
      fixExplanation = 'Cleans temporary folders to keep file I/O optimal.';
    } else {
      fixCommand = `rm -rf /tmp/* 2>/dev/null || true`;
      fixExplanation = 'Cleans temporary files.';
    }
  }

  const proposedFix: ProposedFix = {
    id: `fix-${Date.now()}`,
    title: fixTitle,
    description: fixDesc,
    command: fixCommand,
    os,
    explanation: fixExplanation,
    riskLevel: 'safe',
    executed: false,
    verified: false,
  };

  const artifactHtml = buildDiagnosticArtifactHtml({
    caseId,
    defectTitle,
    rootCause,
    severity,
    userPrompt,
    telemetry,
    proposedFix,
    helpdeskNotes,
  });

  const artifact: DiagnosticArtifact = {
    id: `artifact-${Date.now()}`,
    caseId,
    defectTitle,
    rootCause,
    severity,
    category: telemetry.networkConnected && telemetry.dnsWorking ? 'performance' : 'network',
    systemSummary: `${telemetry.os.toUpperCase()} (${telemetry.osVersion}) · CPU: ${telemetry.cpuUsagePercent}% · RAM: ${telemetry.memoryUsagePercent}% · Disk: ${telemetry.diskUsagePercent}%`,
    evidence,
    helpdeskNotes,
    recommendedAction: fixTitle,
    htmlContent: artifactHtml,
    generatedAt: new Date().toISOString(),
  };

  const conversationalSummary = `I've completed deep telemetric analysis of your system!\n\n🔍 **Defect Detected**: **${defectTitle}**\n\n📌 **Root Cause**: ${rootCause}\n\n📊 **Key Evidence**:\n${evidence.map((e) => `• ${e}`).join('\n')}\n\nI have generated an interactive **Diagnostic Report (.html)** for you and your Tier-1 Helpdesk agent, and prepared the automated fix below.`;

  return {
    defectTitle,
    rootCause,
    severity,
    evidence,
    helpdeskNotes,
    proposedFix,
    artifact,
    conversationalSummary,
  };
}
