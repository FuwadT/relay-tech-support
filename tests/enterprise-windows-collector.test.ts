import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { validateTelemetrySnapshot } from '../lib/enterprise/telemetry-validation';

const script = 'enterprise/collectors/windows.ps1';
const windows = { skip: process.platform !== 'win32' };
function powershell(command: string) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  // Do not print captured telemetry, host details or process names on failure.
  assert.equal(result.error, undefined, 'PowerShell process must start');
  assert.equal(result.status, 0, 'PowerShell structural/fixture check must succeed');
  return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
}

test('Windows collector parses natively and exposes only fixed read operations', windows, () => {
  const parsed = powershell("$tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'enterprise/collectors/windows.ps1'),[ref]$tokens,[ref]$errors); @{errors=@($errors).Count; commands=@($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst]},$true) | ForEach-Object {$_.GetCommandName()} | Sort-Object -Unique)} | ConvertTo-Json -Compress");
  assert.equal(parsed.errors, 0);
  const allowed = new Set(['Add-CollectionError', 'ConvertTo-Json', 'ConvertTo-MatchedProcessSample', 'ConvertTo-SafeProcessName',
    'ConvertTo-SampledCpuPercent', 'ForEach-Object', 'Get-CimInstance', 'Get-Process', 'Invoke-RestMethod', 'Invoke-WindowsSnapshot',
    'Measure-Object', 'New-Object', 'Read-ProcessCounters', 'Select-Object', 'Set-Clipboard', 'Sort-Object', 'Start-Sleep', 'Where-Object', 'Write-Host']);
  assert.ok(parsed.commands.every((command: string) => allowed.has(command)), 'Collector commands must remain an explicit read-only allowlist');
  const source = readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /Invoke-Expression|Invoke-WebRequest|Start-Process|Get-WinEvent|Get-EventLog|Set-Item|Out-File|\.CommandLine|\.MachineName|\.HostName/i);
  assert.match(source, /OperationTimeoutSec 3/);
  assert.match(source, /Start-Sleep -Milliseconds 1000/);
});

test('sampled CPU uses elapsed deltas and logical capacity; unknown or reused PID stays unknown', windows, () => {
  const result = powershell(". './enterprise/collectors/windows.ps1'; $before=@{pid=42;startTicks=100;cpuSeconds=100;sampledTicks=0}; $after=@{pid=42;startTicks=100;cpuSeconds=101;sampledTicks=[Diagnostics.Stopwatch]::Frequency;name='Fixture';memoryMb=10}; $matched=ConvertTo-MatchedProcessSample $before $after 8; $reused=@{}+$after; $reused.startTicks=200; @{normalized=(ConvertTo-SampledCpuPercent 100 101 1 8); unchanged=(ConvertTo-SampledCpuPercent 100 100 1 8); invalidDelta=(ConvertTo-SampledCpuPercent 100 99 1 8); missing=(ConvertTo-SampledCpuPercent $null 101 1 8); invalidInterval=(ConvertTo-SampledCpuPercent 100 101 0 8); nonfinite=(ConvertTo-SampledCpuPercent 0 ([double]::PositiveInfinity) 1 8); matched=$matched.cpuPercent; reused=(ConvertTo-MatchedProcessSample $before $reused 8).cpuPercent; inaccessible=(ConvertTo-MatchedProcessSample $null $after 8).cpuPercent; safeName=(ConvertTo-SafeProcessName ('<unsafe>' + ('x'*150)))} | ConvertTo-Json -Compress");
  assert.equal(result.normalized, 12.5);
  assert.equal(result.unchanged, 0);
  assert.equal(result.matched, 12.5);
  for (const field of ['invalidDelta', 'missing', 'invalidInterval', 'nonfinite', 'reused', 'inaccessible']) assert.equal(result[field], null);
  assert.equal(result.safeName.length, 128);
  assert.doesNotMatch(result.safeName, /[<>]/);
});

test('unverified required OS or architecture metadata refuses output with a fixed safe error', windows, () => {
  const command = ". './enterprise/collectors/windows.ps1'; function Get-CimInstance { throw 'synthetic fixture error, do not expose this'; }; Invoke-WindowsSnapshot | ConvertTo-Json -Depth 8 -Compress";
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.trim(), '', 'Unverified platform must not fabricate a canonical snapshot');
  assert.match(result.stderr, /requires a verified Windows 11 x64 workstation/);
  assert.doesNotMatch(result.stderr, /synthetic fixture error/);
});

test('verified Windows metadata allows partial measurement failures to remain null', windows, () => {
  const result = powershell(". './enterprise/collectors/windows.ps1'; function Get-CimInstance { param($ClassName) switch ($ClassName) { 'Win32_OperatingSystem' { [pscustomobject]@{Version='10.0.26100';BuildNumber=26100;ProductType=1;TotalVisibleMemorySize=$null;FreePhysicalMemory=$null;SystemDrive='C:'} } 'Win32_Processor' { [pscustomobject]@{Architecture=9;NumberOfLogicalProcessors=8} } 'Win32_LogicalDisk' { throw 'synthetic disk failure' } } }; function Get-Process { throw 'synthetic process failure' }; Invoke-WindowsSnapshot | ConvertTo-Json -Depth 8 -Compress");
  assert.equal(validateTelemetrySnapshot(result).ok, true);
  assert.equal(result.architecture, 'x64');
  for (const field of ['cpuPercent', 'memoryTotalMb', 'memoryUsedMb', 'diskTotalGb', 'diskFreeGb']) assert.equal(result[field], null);
  assert.deepEqual(result.processes, []);
  assert.ok(result.errors.some((error: { checkId: string }) => error.checkId === 'memory'));
  assert.ok(result.errors.some((error: { checkId: string }) => error.checkId === 'system-drive'));
  assert.ok(result.errors.length <= 32);
  assert.doesNotMatch(JSON.stringify(result), /synthetic disk failure|synthetic process failure/);
});

test('fixture memory and storage use decimal units; optional network remains explicitly unavailable', windows, () => {
  const result = powershell(". './enterprise/collectors/windows.ps1' -IncludeNetworkChecks; function Get-CimInstance { param($ClassName) switch ($ClassName) { 'Win32_OperatingSystem' { [pscustomobject]@{Version='10.0.26100';BuildNumber=26100;ProductType=1;TotalVisibleMemorySize=2048;FreePhysicalMemory=1024;SystemDrive='C:'} } 'Win32_Processor' { [pscustomobject]@{Architecture=9;NumberOfLogicalProcessors=8} } 'Win32_LogicalDisk' { [pscustomobject]@{DeviceID='C:';DriveType=3;Size=2000000000;FreeSpace=1000000000} } } }; function Get-Process { @() }; Invoke-WindowsSnapshot | ConvertTo-Json -Depth 8 -Compress");
  assert.equal(validateTelemetrySnapshot(result).ok, true);
  assert.equal(result.memoryTotalMb, 2.097);
  assert.equal(result.memoryUsedMb, 1.049);
  assert.equal(result.diskTotalGb, 2);
  assert.equal(result.diskFreeGb, 1);
  assert.equal(result.cpuPercent, null);
  assert.equal(result.dnsResolved, null);
  assert.equal(result.gatewayLatencyMs, null);
  assert.ok(result.errors.some((error: { checkId: string }) => error.checkId === 'network-probes-not-implemented'));
});

test('native Windows snapshot satisfies canonical parser without collecting logs or probing network', windows, () => {
  const result = powershell("& './enterprise/collectors/windows.ps1' -CollectionId '00000000-0000-4000-8000-000000000001'");
  assert.equal(validateTelemetrySnapshot(result).ok, true, 'Native output must satisfy canonical schema');
  assert.equal(result.collectionId, '00000000-0000-4000-8000-000000000001');
  assert.equal(result.collectorVersion, '1.0.0');
  assert.equal(result.platform, 'windows');
  assert.equal(result.source, 'collector');
  assert.equal(result.cpuPercent, null, 'Process samples cannot stand in for machine total CPU');
  assert.equal(result.dnsResolved, null);
  assert.equal(result.gatewayLatencyMs, null);
  assert.deepEqual(result.eventExcerpts, []);
  assert.ok(result.processes.length <= 20 && result.errors.length <= 32);
  assert.ok(result.errors.some((error: { checkId: string }) => error.checkId === 'event-excerpts-not-collected'));
  assert.equal(result.architecture, 'x64');
  assert.ok(result.sampleIntervalMs >= 1000, 'Collector must report its measured one-second sampling window');
  assert.ok(result.processes.every((sample: { cpuPercent: number | null }) => sample.cpuPercent === null || (sample.cpuPercent >= 0 && sample.cpuPercent <= 100)));
});
