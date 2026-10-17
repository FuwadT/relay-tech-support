/**
 * Curated Enterprise IT Support Runbooks & Diagnostic Knowledge Base.
 *
 * Each runbook encapsulates verified, safe IT standard operating procedures (SOPs)
 * for common enterprise workstation, application, and network failure modes.
 * Strictly non-elevated, privacy-preserving, and evidence-grounded.
 */

import type { DevicePlatform } from '../contracts';

export interface ITRunbook {
  id: string;
  title: string;
  category: 'memory' | 'cpu_thermal' | 'network_dns' | 'disk_io' | 'application' | 'general';
  keywords: string[];
  findings: string[];
  platforms: DevicePlatform[];
  summary: string;
  diagnosticChecks: string[];
  safeRemediations: Array<{
    platform: DevicePlatform;
    title: string;
    commandOrSteps: string;
    isScript: boolean;
  }>;
  commonPitfalls: string[];
}

export const ENTERPRISE_RUNBOOKS: readonly ITRunbook[] = [
  // ─── 1. Memory Pressure & Working Set Bloat ─────────────────────────────
  {
    id: 'rb-memory-pressure',
    title: 'High Memory Utilization & Working Set Diagnostics',
    category: 'memory',
    keywords: [
      'memory', 'ram', 'slow', 'sluggish', 'paging', 'freeze', 'unresponsive',
      'working set', 'out of memory', 'oom', 'leak', 'lag'
    ],
    findings: ['memory-high', 'process-memory-recheck'],
    platforms: ['windows', 'macos', 'ubuntu'],
    summary:
      'High physical memory utilization (>85%) causes operating systems to aggressively flush pages to disk, leading to severe system-wide stutter and sluggishness.',
    diagnosticChecks: [
      'Distinguish OS standby/cache list from active application Private Working Set.',
      'Check if memory pressure is driven by a single runaway process vs distributed across dozens of browser tabs or Electron apps (Teams, Slack).',
      'NEVER attempt to kill PID 0 (System Idle Process) or essential kernel services.',
      'Inspect top memory-consuming processes using non-elevated, read-only process queries.',
    ],
    safeRemediations: [
      {
        platform: 'windows',
        title: 'Query Top 5 Memory Consumers (Non-elevated PowerShell)',
        commandOrSteps:
          'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 -Property Id, ProcessName, @{Name="MemoryMB"; Expression={[math]::Round($_.WorkingSet64 / 1MB, 1)}}',
        isScript: true,
      },
      {
        platform: 'windows',
        title: 'Discard Inactive Browser Tabs (Zero-Install)',
        commandOrSteps:
          'In Chrome or Edge, open chrome://discards (or edge://discards) and click "Discard" next to inactive tabs, or enable Memory Saver under Settings > Performance.',
        isScript: false,
      },
      {
        platform: 'macos',
        title: 'Query Top 5 Memory Processes (macOS Terminal)',
        commandOrSteps: 'ps -eo pid,pmem,comm -r | head -n 6',
        isScript: true,
      },
      {
        platform: 'ubuntu',
        title: 'Query Top 5 Memory Processes (Ubuntu Terminal)',
        commandOrSteps: 'ps -eo pid,pmem,comm --sort=-pmem | head -n 6',
        isScript: true,
      },
    ],
    commonPitfalls: [
      'Targeting PID 0 or PID 4: Windows PID 0 is the System Idle Process and PID 4 is the NT Kernel. Neither can or should be closed.',
      'Assuming memory-high means a hardware defect: 90%+ RAM usage in modern workstations is frequently caused by browser tab sprawl or background caching.',
    ],
  },

  // ─── 2. CPU Contention & Thermal Throttling ─────────────────────────────
  {
    id: 'rb-cpu-contention',
    title: 'Elevated CPU Utilization & Thermal Throttling',
    category: 'cpu_thermal',
    keywords: [
      'cpu', 'fan', 'noise', 'heat', 'warm', 'thermal', 'throttling', 'spin',
      'loud', '100% cpu', 'freezing'
    ],
    findings: ['cpu-high', 'cpu-sample-unknown', 'process-cpu-recheck'],
    platforms: ['windows', 'macos', 'ubuntu'],
    summary:
      'Continuous high CPU load (>80%) spins cooling fans to maximum RPM and triggers thermal downclocking, creating severe UI lag.',
    diagnosticChecks: [
      'Determine whether CPU load is isolated to an active foreground app or persists when idle.',
      'Check for disabled GPU hardware acceleration in Chromium apps forcing software rasterization.',
      'Identify background search indexing (Windows SearchIndexer.exe, macOS mds_stores).',
    ],
    safeRemediations: [
      {
        platform: 'windows',
        title: 'Query Top CPU Consumers (Non-elevated PowerShell)',
        commandOrSteps:
          'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 -Property Id, ProcessName, CPU',
        isScript: true,
      },
      {
        platform: 'windows',
        title: 'Request Graceful Window Close for Non-Responsive App',
        commandOrSteps:
          'Use Relay catalog action win-proc-graceful-request with a confirmed positive PID (pid > 4) belonging to your user session.',
        isScript: false,
      },
      {
        platform: 'macos',
        title: 'Query Top CPU Processes (macOS Terminal)',
        commandOrSteps: 'top -l 1 -s 0 -n 5 -o cpu',
        isScript: true,
      },
    ],
    commonPitfalls: [
      'Killing system background tasks: Windows Defender, SearchIndexer, or telemetry tasks should be allowed to finish or adjusted via settings, not forcibly terminated.',
    ],
  },

  // ─── 3. Network DNS & Connectivity Drops ────────────────────────────────
  {
    id: 'rb-network-dns',
    title: 'DNS Resolution Failures & Network Adapter Latency',
    category: 'network_dns',
    keywords: [
      'dns', 'wifi', 'wi-fi', 'network', 'disconnect', 'ping', 'gateway',
      'latency', 'drop', 'internet', 'offline', 'resolve', 'name resolution'
    ],
    findings: ['dns-unsuccessful', 'gateway-latency-high'],
    platforms: ['windows', 'macos', 'ubuntu'],
    summary:
      'DNS resolution failures prevent browsers and cloud synchronizers from mapping domain names to IP addresses, appearing as sudden offline disconnects.',
    diagnosticChecks: [
      'Verify if raw IP addresses (e.g. 1.1.1.1 or 8.8.8.8) are pingable while domain names fail.',
      'Check if corporate VPN split-tunneling is capturing DNS queries while gateway is offline.',
      'Check local resolver cache freshness.',
    ],
    safeRemediations: [
      {
        platform: 'windows',
        title: 'Flush Local DNS Client Cache (PowerShell)',
        commandOrSteps: 'Clear-DnsClientCache',
        isScript: true,
      },
      {
        platform: 'macos',
        title: 'Refresh Local mDNS Cache (macOS)',
        commandOrSteps: 'killall -HUP mDNSResponder',
        isScript: true,
      },
      {
        platform: 'ubuntu',
        title: 'Flush Local Resolver Cache (Ubuntu)',
        commandOrSteps: 'resolvectl flush-caches 2>/dev/null || systemd-resolve --flush-caches',
        isScript: true,
      },
    ],
    commonPitfalls: [
      'Resetting entire network adapters during active conference calls.',
      'Editing system HOSTS files without corporate DNS approval.',
    ],
  },

  // ─── 4. Disk Storage Exhaustion ─────────────────────────────────────────
  {
    id: 'rb-disk-exhaustion',
    title: 'Disk Storage Exhaustion & Virtual Memory Thrashing',
    category: 'disk_io',
    keywords: [
      'disk', 'storage', 'space', 'full', 'drive', 'low disk', 'gigabytes',
      'temp', 'temporary files', 'cleanup'
    ],
    findings: ['disk-free-low'],
    platforms: ['windows', 'macos', 'ubuntu'],
    summary:
      'When workstation free disk drops below 10%, Windows and macOS cannot expand swap/paging files, causing severe application stutter and crash-on-save errors.',
    diagnosticChecks: [
      'Identify whether the low storage is on the primary system volume (%SystemDrive%).',
      'Identify stale temporary files older than 7 days in user %TEMP%.',
      'Examine browser download caches.',
    ],
    safeRemediations: [
      {
        platform: 'windows',
        title: 'Clean Stale User Temp Files Older than 7 Days',
        commandOrSteps:
          '$cutoff = (Get-Date).AddDays(-7)\nGet-ChildItem -Path $env:TEMP -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -Force -ErrorAction SilentlyContinue',
        isScript: true,
      },
      {
        platform: 'windows',
        title: 'Empty Recycle Bin (User-Driven)',
        commandOrSteps: 'Right-click Recycle Bin on Desktop > Empty Recycle Bin.',
        isScript: false,
      },
    ],
    commonPitfalls: [
      'Deleting active installer temporary files while an update is in progress.',
      'Modifying Windows C:\\Windows\\System32 or macOS /System directories.',
    ],
  },

  // ─── 5. Browser Web Apps, Cookies & Permissions ─────────────────────────
  {
    id: 'rb-browser-webapps',
    title: 'Browser Web Portals, Stale Cookies & Site Permissions',
    category: 'application',
    keywords: [
      'portal', 'browser', 'cookie', 'cookies', 'cache', '403', '502',
      'permission', 'site', 'website', 'login loop', 'blank page'
    ],
    findings: [],
    platforms: ['windows', 'macos', 'ubuntu'],
    summary:
      'Web application failures such as 403 Forbidden, stale authentication loops, or blank screens are almost always caused by cached credentials, expired session cookies, or blocked permissions.',
    diagnosticChecks: [
      'Check if the portal loads in an Incognito / InPrivate browser window.',
      'Check for blocked site permissions (microphone, camera, cookies).',
      'Clear cookies specifically for the affected domain rather than wiping global browser history.',
    ],
    safeRemediations: [
      {
        platform: 'windows',
        title: 'Clear Domain-Specific Site Data (Chrome / Edge)',
        commandOrSteps:
          '1. In the browser, navigate to chrome://settings/content/all (or edge://settings/content/all)\n2. Search for the portal domain name in the search box.\n3. Click the Trash icon to delete cached cookies and storage for that specific site.\n4. Refresh the portal page and sign in again.',
        isScript: false,
      },
      {
        platform: 'windows',
        title: 'Test in Incognito Mode',
        commandOrSteps: 'Press Ctrl+Shift+N (Chrome/Edge) or Ctrl+Shift+P (Firefox) and navigate to the portal.',
        isScript: false,
      },
    ],
    commonPitfalls: [
      'Wiping all browser history: Users lose saved logins for every website instead of clearing just the broken portal.',
      'Requiring administrative scripts when simple browser cookie clearing completely resolves the issue.',
    ],
  },

  // ─── 6. Terminal Script Feedback & Recovery ─────────────────────────────
  {
    id: 'rb-terminal-recovery',
    title: 'Remediation Script Feedback, Non-Existent PIDs & Session Isolation',
    category: 'general',
    keywords: [
      'process not found', 'skipped', 'another session', 'powershell', 'terminal',
      'script error', 'exit code', 'copied to clipboard', 'get-process'
    ],
    findings: [],
    platforms: ['windows', 'macos', 'ubuntu'],
    summary:
      'When a user runs a remediation script and receives "Process not found or belongs to another session; skipped", this indicates the process has already exited or runs in another session.',
    diagnosticChecks: [
      'Verify the target PID was not 0: PID 0 is the System Idle Process and cannot be managed.',
      'Check if the target application already closed before the script was executed.',
      'Query the user session to verify active running processes and working sets.',
    ],
    safeRemediations: [
      {
        platform: 'windows',
        title: 'Inspect Active User Processes (Non-elevated)',
        commandOrSteps:
          'Get-Process | Where-Object { $_.SessionId -eq (Get-Process -Id $PID).SessionId } | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 -Property Id, ProcessName, @{Name="MemoryMB"; Expression={[math]::Round($_.WorkingSet64 / 1MB, 1)}}',
        isScript: true,
      },
    ],
    commonPitfalls: [
      'Resetting the user support session back to authorization card when they report script output.',
      'Assuming the workstation is broken when a non-existent process PID simply skips gracefully.',
    ],
  },
];
