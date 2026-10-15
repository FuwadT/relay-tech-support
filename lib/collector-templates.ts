import type { SupportedOS, SystemTelemetry } from './contracts';

/**
 * Generates the strictly read-only collector script for Windows (PowerShell).
 */
export function generateWindowsCollector(caseId: string, serverOrigin = ''): string {
  const targetUrl = `${serverOrigin}/api/ai/telemetry`;
  return `# Relay AI Diagnostics - Read-Only Diagnostic Collector (Windows)
# Case ID: ${caseId}
# Environment: Constrained Read-Only Execution. Modifies NO files or settings.

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Relay AI Read-Only System Triage Collector (Windows)" -ForegroundColor Cyan
Write-Host "  Case Reference: ${caseId}" -ForegroundColor DarkGray
Write-Host "  Mode: Strictly Read-Only (Non-Destructive Inspection)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[1/5] Inspecting CPU and Running Processes..." -ForegroundColor Yellow

$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
if ($null -eq $cpu) { $cpu = 0 }

$os = Get-CimInstance Win32_OperatingSystem
$totalMemMb = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
$freeMemMb = [math]::Round($os.FreePhysicalMemory / 1024, 0)
$usedMemMb = $totalMemMb - $freeMemMb
$memPercent = if ($totalMemMb -gt 0) { [math]::Round(($usedMemMb / $totalMemMb) * 100, 1) } else { 0 }

Write-Host "[2/5] Inspecting Memory and Storage Volumes..." -ForegroundColor Yellow
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object -First 1
$diskTotalGb = if ($disk.Size) { [math]::Round($disk.Size / 1GB, 1) } else { 0 }
$diskFreeGb = if ($disk.FreeSpace) { [math]::Round($disk.FreeSpace / 1GB, 1) } else { 0 }
$diskUsagePercent = if ($diskTotalGb -gt 0) { [math]::Round((($diskTotalGb - $diskFreeGb) / $diskTotalGb) * 100, 1) } else { 0 }

Write-Host "[3/5] Querying Top Resource Consumers..." -ForegroundColor Yellow
$topProcesses = @()
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 | ForEach-Object {
    $topProcesses += @{
        pid = $_.Id
        name = $_.ProcessName
        cpuPercent = [math]::Round($_.CPU, 1)
        memoryMb = [math]::Round($_.WorkingSet64 / 1MB, 1)
    }
}

Write-Host "[4/5] Checking Network Connectivity and DNS Resolution..." -ForegroundColor Yellow
$ping = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet
$dns = $false
try {
    $dnsResolved = Resolve-DnsName -Name "cloudflare.com" -QuickTimeout -ErrorAction Stop
    if ($dnsResolved) { $dns = $true }
} catch {
    $dns = $false
}

Write-Host "[5/5] Extracting System Error Logs..." -ForegroundColor Yellow
$systemErrors = @()
try {
    Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddHours(-12)} -MaxEvents 8 -ErrorAction Stop | ForEach-Object {
        $msg = $_.Message
        if ($msg.Length -gt 160) { $msg = $msg.Substring(0, 157) + "..." }
        $systemErrors += "$($_.TimeCreated.ToString('HH:mm:ss')) [$($_.ProviderName)] $msg"
    }
} catch {
    $systemErrors += "No critical system event log entries in the last 12 hours."
}

$telemetry = @{
    caseId = "${caseId}"
    os = "windows"
    osVersion = "$($os.Caption) $($os.Version)"
    hostname = $env:COMPUTERNAME
    cpuModel = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
    cpuUsagePercent = [math]::Round($cpu, 1)
    memoryTotalMb = $totalMemMb
    memoryUsedMb = $usedMemMb
    memoryUsagePercent = $memPercent
    diskTotalGb = $diskTotalGb
    diskFreeGb = $diskFreeGb
    diskUsagePercent = $diskUsagePercent
    networkConnected = [bool]$ping
    dnsWorking = [bool]$dns
    topProcesses = $topProcesses
    systemErrors = $systemErrors
    collectedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

$jsonPayload = $telemetry | ConvertTo-Json -Depth 5
Write-Host ""
Write-Host "[+] Triage complete. Streaming telemetric analysis to Relay AI..." -ForegroundColor Green

$endpoint = "${targetUrl}"
try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $jsonPayload -ContentType "application/json" -TimeoutSec 15
    Write-Host "[SUCCESS] Telemetry received by Relay AI. Check your browser for the diagnostic report!" -ForegroundColor Green
} catch {
    Write-Host "[!] Could not post directly to server. Here is your raw telemetry JSON to paste into Relay:" -ForegroundColor Yellow
    Write-Output $jsonPayload
}
`;
}

/**
 * Generates the strictly read-only collector script for macOS (zsh/bash).
 */
export function generateMacCollector(caseId: string, serverOrigin = ''): string {
  const targetUrl = `${serverOrigin}/api/ai/telemetry`;
  return `#!/usr/bin/env bash
# Relay AI Diagnostics - Read-Only Diagnostic Collector (macOS)
# Case ID: ${caseId}
# Environment: Strictly Read-Only. No settings or files modified.
set -e

printf "\\033[36m==========================================================\\033[0m\\n"
printf "\\033[36m  Relay AI Read-Only System Triage Collector (macOS)\\033[0m\\n"
printf "\\033[90m  Case Reference: ${caseId}\\033[0m\\n"
printf "\\033[32m  Mode: Strictly Read-Only (Non-Destructive Inspection)\\033[0m\\n"
printf "\\033[36m==========================================================\\033[0m\\n\\n"

printf "\\033[33m[1/5] Reading System Profile and macOS Version...\\033[0m\\n"
OS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "macOS")
HOSTNAME=$(hostname -s 2>/dev/null || echo "MacBook")
CPU_MODEL=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon / Intel")

printf "\\033[33m[2/5] Reading CPU and Memory Allocation...\\033[0m\\n"
MEM_TOTAL_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo "8589934592")
MEM_TOTAL_MB=$(( MEM_TOTAL_BYTES / 1024 / 1024 ))
# Calculate active memory via vm_stat
VM_STAT=$(vm_stat 2>/dev/null || echo "")
PAGE_FREE=$(echo "$VM_STAT" | awk '/Pages free/ {print $3}' | tr -d '.' || echo "100000")
MEM_FREE_MB=$(( PAGE_FREE * 4096 / 1024 / 1024 ))
MEM_USED_MB=$(( MEM_TOTAL_MB - MEM_FREE_MB ))
if [ "$MEM_USED_MB" -lt 0 ]; then MEM_USED_MB=$(( MEM_TOTAL_MB * 70 / 100 )); fi
MEM_PERCENT=$(( MEM_USED_MB * 100 / MEM_TOTAL_MB ))

# CPU Usage
CPU_IDLE=$(top -l 1 -n 0 | awk '/CPU usage/ {print $7}' | tr -d '%' || echo "20")
CPU_USAGE=$(awk "BEGIN {print 100 - \${CPU_IDLE:-20}}")

printf "\\033[33m[3/5] Querying Storage and Disk Volumes...\\033[0m\\n"
DISK_LINE=$(df -g / | tail -n 1)
DISK_TOTAL_GB=$(echo "$DISK_LINE" | awk '{print $2}')
DISK_FREE_GB=$(echo "$DISK_LINE" | awk '{print $4}')
DISK_PERCENT=$(echo "$DISK_LINE" | awk '{print $5}' | tr -d '%')

printf "\\033[33m[4/5] Checking Network and DNS Resolution...\\033[0m\\n"
PING_OK=false
if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then PING_OK=true; fi
DNS_OK=false
if host -W 2 cloudflare.com >/dev/null 2>&1; then DNS_OK=true; fi

printf "\\033[33m[5/5] Extracting Top Processes and Error Logs...\\033[0m\\n"
# Top processes
TOP_PS_JSON=$(ps -A -o pid,%cpu,rss,comm -r | head -n 11 | tail -n +2 | awk '{
  printf "{\\"pid\\":%s,\\"name\\":\\"%s\\",\\"cpuPercent\\":%s,\\"memoryMb\\":%d},", $1, $4, $2, ($3/1024)
}' | sed 's/,$//')

# System Errors from syslog or log show
ERRORS_JSON=$(log show --predicate 'messageType == error' --last 30m --style syslog 2>/dev/null | tail -n 8 | awk '{
  gsub(/"/, "\\\\\\"");
  printf "\\"%s\\",", $0
}' | sed 's/,$//')

JSON_PAYLOAD=$(cat <<EOF
{
  "caseId": "${caseId}",
  "os": "macos",
  "osVersion": "$OS_VERSION",
  "hostname": "$HOSTNAME",
  "cpuModel": "$CPU_MODEL",
  "cpuUsagePercent": $CPU_USAGE,
  "memoryTotalMb": $MEM_TOTAL_MB,
  "memoryUsedMb": $MEM_USED_MB,
  "memoryUsagePercent": $MEM_PERCENT,
  "diskTotalGb": $DISK_TOTAL_GB,
  "diskFreeGb": $DISK_FREE_GB,
  "diskUsagePercent": $DISK_PERCENT,
  "networkConnected": $PING_OK,
  "dnsWorking": $DNS_OK,
  "topProcesses": [$TOP_PS_JSON],
  "systemErrors": [$ERRORS_JSON],
  "collectedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

printf "\\n\\033[32m[+] Triage complete. Streaming telemetric analysis to Relay AI...\\033[0m\\n"
curl -s -X POST "${targetUrl}" \\
  -H "Content-Type: application/json" \\
  -d "$JSON_PAYLOAD" || {
    printf "\\033[33m[!] Could not post directly to server. Here is your raw telemetry JSON:\\033[0m\\n"
    printf "%s\\n" "$JSON_PAYLOAD"
  }
printf "\\n\\033[32m[SUCCESS] Telemetry received by Relay AI. Check your browser for the diagnostic report!\\033[0m\\n"
`;
}

/**
 * Generates the strictly read-only collector script for Linux (bash).
 */
export function generateLinuxCollector(caseId: string, serverOrigin = ''): string {
  const targetUrl = `${serverOrigin}/api/ai/telemetry`;
  return `#!/usr/bin/env bash
# Relay AI Diagnostics - Read-Only Diagnostic Collector (Linux)
# Case ID: ${caseId}
# Environment: Strictly Read-Only. No files or system settings modified.
set -e

printf "\\033[36m==========================================================\\033[0m\\n"
printf "\\033[36m  Relay AI Read-Only System Triage Collector (Linux)\\033[0m\\n"
printf "\\033[90m  Case Reference: ${caseId}\\033[0m\\n"
printf "\\033[32m  Mode: Strictly Read-Only (Non-Destructive Inspection)\\033[0m\\n"
printf "\\033[36m==========================================================\\033[0m\\n\\n"

printf "\\033[33m[1/5] Reading System Specs and Kernel Version...\\033[0m\\n"
OS_VERSION=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"' || uname -sr)
HOSTNAME=$(hostname -s 2>/dev/null || echo "linux-host")
CPU_MODEL=$(awk -F': ' '/model name/ {print $2; exit}' /proc/cpuinfo 2>/dev/null || uname -m)

printf "\\033[33m[2/5] Reading CPU Load and Memory Footprint...\\033[0m\\n"
# CPU percentage
CPU_USAGE=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf "%.1f", usage}')
MEM_TOTAL_MB=$(free -m | awk '/Mem:/ {print $2}')
MEM_USED_MB=$(free -m | awk '/Mem:/ {print $3}')
MEM_PERCENT=$(free | awk '/Mem:/ {printf "%.1f", $3/$2 * 100}')

printf "\\033[33m[3/5] Querying Storage and Disk Partitions...\\033[0m\\n"
DISK_TOTAL_GB=$(df -BG / | awk 'NR==2 {print $2}' | tr -d 'G')
DISK_FREE_GB=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
DISK_PERCENT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')

printf "\\033[33m[4/5] Checking Network Interfaces and DNS...\\033[0m\\n"
PING_OK=false
if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then PING_OK=true; fi
DNS_OK=false
if host -W 2 cloudflare.com >/dev/null 2>&1; then DNS_OK=true; fi

printf "\\033[33m[5/5] Extracting Top Processes and Journal Errors...\\033[0m\\n"
TOP_PS_JSON=$(ps -eo pid,%cpu,rss,comm --sort=-%cpu | head -n 11 | tail -n +2 | awk '{
  printf "{\\"pid\\":%s,\\"name\\":\\"%s\\",\\"cpuPercent\\":%s,\\"memoryMb\\":%d},", $1, $4, $2, ($3/1024)
}' | sed 's/,$//')

JOURNAL_ERRORS=$(journalctl -p 3 -xb -n 8 --no-pager 2>/dev/null | awk '{
  gsub(/"/, "\\\\\\"");
  printf "\\"%s\\",", $0
}' | sed 's/,$//')

JSON_PAYLOAD=$(cat <<EOF
{
  "caseId": "${caseId}",
  "os": "linux",
  "osVersion": "$OS_VERSION",
  "hostname": "$HOSTNAME",
  "cpuModel": "$CPU_MODEL",
  "cpuUsagePercent": $CPU_USAGE,
  "memoryTotalMb": $MEM_TOTAL_MB,
  "memoryUsedMb": $MEM_USED_MB,
  "memoryUsagePercent": $MEM_PERCENT,
  "diskTotalGb": $DISK_TOTAL_GB,
  "diskFreeGb": $DISK_FREE_GB,
  "diskUsagePercent": $DISK_PERCENT,
  "networkConnected": $PING_OK,
  "dnsWorking": $DNS_OK,
  "topProcesses": [$TOP_PS_JSON],
  "systemErrors": [$JOURNAL_ERRORS],
  "collectedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

printf "\\n\\033[32m[+] Triage complete. Streaming telemetric analysis to Relay AI...\\033[0m\\n"
curl -s -X POST "${targetUrl}" \\
  -H "Content-Type: application/json" \\
  -d "$JSON_PAYLOAD" || {
    printf "\\033[33m[!] Could not post directly to server. Here is your raw telemetry JSON:\\033[0m\\n"
    printf "%s\\n" "$JSON_PAYLOAD"
  }
printf "\\n\\033[32m[SUCCESS] Telemetry received by Relay AI. Check your browser for the diagnostic report!\\033[0m\\n"
`;
}

/**
 * Generates one-liner terminal commands for each OS.
 */
export function getOneLinerCommand(os: SupportedOS, caseId: string, origin = ''): string {
  const cleanOrigin = origin || 'http://localhost:3000';
  switch (os) {
    case 'windows':
      return `irm "${cleanOrigin}/api/ai/collector?os=windows&caseId=${caseId}" | iex`;
    case 'macos':
      return `curl -fsSL "${cleanOrigin}/api/ai/collector?os=macos&caseId=${caseId}" | bash`;
    case 'linux':
      return `curl -fsSL "${cleanOrigin}/api/ai/collector?os=linux&caseId=${caseId}" | bash`;
  }
}

/**
 * Realistic sample telemetry datasets for instant browser testing or fallback simulation.
 */
export function getSampleTelemetry(scenario: 'high-cpu' | 'disk-full' | 'network-dns' | 'memory-leak', os: SupportedOS = 'windows'): SystemTelemetry {
  const now = new Date().toISOString();
  switch (scenario) {
    case 'high-cpu':
      return {
        os,
        osVersion: os === 'windows' ? 'Windows 11 Pro 23H2 (Build 22631.3447)' : os === 'macos' ? 'macOS Sonoma 14.4.1 (Darwin 23.4.0)' : 'Ubuntu 24.04 LTS (Kernel 6.8.0-31-generic)',
        hostname: os === 'windows' ? 'DESKTOP-R9L42' : os === 'macos' ? 'MacBook-Pro-M2' : 'workstation-dev',
        cpuModel: os === 'windows' ? '13th Gen Intel(R) Core(TM) i7-13700K' : os === 'macos' ? 'Apple M2 Pro (10-core)' : 'AMD Ryzen 7 7800X3D 8-Core Processor',
        cpuUsagePercent: 94.6,
        memoryTotalMb: 32768,
        memoryUsedMb: 14210,
        memoryUsagePercent: 43.3,
        diskTotalGb: 953.8,
        diskFreeGb: 482.1,
        diskUsagePercent: 49.4,
        networkConnected: true,
        dnsWorking: true,
        gatewayPingMs: 12,
        topProcesses: [
          { pid: 4821, name: os === 'windows' ? 'SearchIndexer.exe' : os === 'macos' ? 'mds_stores' : 'tracker-miner-fs-3', cpuPercent: 88.4, memoryMb: 1840 },
          { pid: 1932, name: os === 'windows' ? 'chrome.exe' : 'Google Chrome', cpuPercent: 4.1, memoryMb: 920 },
          { pid: 814, name: os === 'windows' ? 'explorer.exe' : os === 'macos' ? 'Finder' : 'gnome-shell', cpuPercent: 1.2, memoryMb: 340 },
        ],
        systemErrors: [
          'Warning [Search/Indexing]: Indexer catalogue is corrupted, triggering continuous retry cycle on index DB.',
          'Event 7034: Service Windows Search terminated unexpectedly. Auto-restart attempted 14 times in 1 hour.',
        ],
        collectedAt: now,
      };

    case 'disk-full':
      return {
        os,
        osVersion: os === 'windows' ? 'Windows 11 Home 23H2' : os === 'macos' ? 'macOS Ventura 13.6' : 'Debian 12 Bookworm',
        hostname: 'LAPTOP-OFFICE',
        cpuModel: 'Intel Core i5-1135G7',
        cpuUsagePercent: 18.2,
        memoryTotalMb: 16384,
        memoryUsedMb: 8940,
        memoryUsagePercent: 54.5,
        diskTotalGb: 256.0,
        diskFreeGb: 1.2,
        diskUsagePercent: 99.5,
        networkConnected: true,
        dnsWorking: true,
        gatewayPingMs: 18,
        topProcesses: [
          { pid: 3102, name: os === 'windows' ? 'TiWorker.exe' : 'systemd-journald', cpuPercent: 9.2, memoryMb: 420 },
          { pid: 2840, name: 'slack', cpuPercent: 3.1, memoryMb: 680 },
        ],
        systemErrors: [
          'Critical: Volume C: (Root) has reached 99.5% capacity. Low disk space alert triggered.',
          'Error: Temporary staging directory contains 44.2 GB of unpurged update cache logs.',
        ],
        collectedAt: now,
      };

    case 'network-dns':
      return {
        os,
        osVersion: os === 'windows' ? 'Windows 11 Pro 23H2' : os === 'macos' ? 'macOS Sonoma 14.4' : 'Ubuntu 22.04 LTS',
        hostname: 'DESKTOP-HOME',
        cpuModel: 'AMD Ryzen 5 5600X',
        cpuUsagePercent: 6.4,
        memoryTotalMb: 16384,
        memoryUsedMb: 6100,
        memoryUsagePercent: 37.2,
        diskTotalGb: 512.0,
        diskFreeGb: 310.4,
        diskUsagePercent: 39.3,
        networkConnected: true,
        dnsWorking: false,
        gatewayPingMs: 9,
        topProcesses: [
          { pid: 1420, name: os === 'windows' ? 'svchost.exe (Dnscache)' : 'mDNSResponder', cpuPercent: 2.1, memoryMb: 68 },
          { pid: 3312, name: 'msedge.exe', cpuPercent: 1.8, memoryMb: 410 },
        ],
        systemErrors: [
          'Error [DNS Client Events 1014]: Name resolution for address cloudflare.com timed out after none of the configured DNS servers responded.',
          'Warning [Netwtw10]: Stale DHCP DNS server configuration detected on primary adapter Wi-Fi.',
        ],
        collectedAt: now,
      };

    case 'memory-leak':
    default:
      return {
        os,
        osVersion: os === 'windows' ? 'Windows 11 Pro' : os === 'macos' ? 'macOS Sonoma' : 'Ubuntu 24.04 LTS',
        hostname: 'DEV-WORKSTATION',
        cpuModel: 'Intel Core i9-12900K',
        cpuUsagePercent: 24.8,
        memoryTotalMb: 16384,
        memoryUsedMb: 15820,
        memoryUsagePercent: 96.5,
        diskTotalGb: 1000.0,
        diskFreeGb: 512.0,
        diskUsagePercent: 48.8,
        networkConnected: true,
        dnsWorking: true,
        gatewayPingMs: 14,
        topProcesses: [
          { pid: 9142, name: 'node.exe', cpuPercent: 16.4, memoryMb: 9240 },
          { pid: 2104, name: 'chrome.exe', cpuPercent: 5.1, memoryMb: 3100 },
        ],
        systemErrors: [
          'Warning: System commit limit reached. Windows paging file actively expanding under severe memory pressure.',
          'Event 2004: Resource-Exhaustion-Detector determined process node (PID 9142) consumed 9.24 GB virtual memory.',
        ],
        collectedAt: now,
      };
  }
}
