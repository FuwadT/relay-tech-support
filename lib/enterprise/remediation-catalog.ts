/** Proposal groundwork; source review and rendering do not establish native acceptance. */
import type { DevicePlatform, RemediationProposal, ValidationResult } from './contracts';
export const REMEDIATION_CATALOG_VERSION = '1.1.0' as const;
export interface CatalogActionDefinition {
  id: string; version: string; platform: DevicePlatform; title: string; description: string;
  prerequisites: string[]; consequences: string[]; rollbackInstructions: string[];
  followUpCheckIds: string[]; requiresElevation: false; allowedParamKeys: readonly string[];
  renderScript: (params: Record<string, string | number | boolean>) => string;
}
interface CloseTarget { pid: number; processName: string; processStartTime: string }
const targetKeys = ['pid', 'processName', 'processStartTime'];
const proposalKeys = ['id', 'catalogActionId', 'catalogVersion', 'platform', 'evidenceIds',
  'parameters', 'consequences', 'rollbackInstructions', 'followUpCheckIds', 'requiresElevation'];
function dataRecord(input: unknown): input is Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(input).every(key => typeof key === 'string'
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(input, key), 'value'));
}
function closeTarget(input: unknown): CloseTarget | null {
  if (!dataRecord(input) || Object.keys(input).length !== targetKeys.length
    || Object.keys(input).some(key => !targetKeys.includes(key))) return null;
  const { pid, processName, processStartTime } = input;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) return null;
  // Single-quoted PowerShell literals: no quotes, substitutions, controls, wildcards or paths.
  if (typeof processName !== 'string' || !/^[A-Za-z0-9_.() -]{1,128}$/.test(processName)
    || !processName.trim() || processName !== processName.trim()) return null;
  if (typeof processStartTime !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(processStartTime)) return null;
  const time = Date.parse(processStartTime);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== processStartTime) return null;
  return { pid, processName, processStartTime };
}
function boundedStrings(input: unknown, min = 0): input is string[] {
  if (!Array.isArray(input) || input.length < min || input.length > 32) return false;
  for (let i = 0; i < input.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string'
      || !descriptor.value.trim() || descriptor.value.length > 512
      || /[\u0000-\u001f\u007f]/.test(descriptor.value)) return false;
  }
  return true;
}
const unavailable = [
  { id: 'win-disk-clean-user-temp', platform: 'windows', reason: 'Removed: irreversible file deletion is outside the approved reversible remediation scope.' },
  { id: 'win-net-flush-dns-cache', platform: 'windows', reason: 'Unavailable: non-elevated permissions and native failure handling have not been verified.' },
  { id: 'mac-net-flush-dns', platform: 'macos', reason: 'Unavailable: signalling a system DNS service is outside the approved non-elevated action scope.' },
  { id: 'ubuntu-net-flush-resolve-cache', platform: 'ubuntu', reason: 'Unavailable: system resolver mutation can require privileged authorization; no verified user-only action exists.' },
  { id: 'mac-proc-graceful-term', platform: 'macos', reason: 'Unavailable: SIGTERM does not guarantee preservation of unsaved work; target identity, ownership and reversibility are not verified.' },
  { id: 'ubuntu-proc-graceful-term', platform: 'ubuntu', reason: 'Unavailable: SIGTERM does not guarantee preservation of unsaved work; target identity, ownership and reversibility are not verified.' },
] as const;
export function getUnavailableCatalogReason(id: string, platform: DevicePlatform): string | null {
  return unavailable.find(action => action.id === id && action.platform === platform)?.reason ?? null;
}
/** Source-reviewed groundwork only. Native release acceptance remains separate. */
export const APPROVED_CATALOG_ACTIONS: readonly CatalogActionDefinition[] = [{
  id: 'win-proc-graceful-request', version: REMEDIATION_CATALOG_VERSION, platform: 'windows',
  title: 'Request an application window to close',
  description: 'After explicit target review, requests WM_CLOSE for a current-user application window. Native acceptance remains pending.',
  prerequisites: [
    'Save your work and confirm this exact application may be closed.',
    'Obtain fresh PID, exact ProcessName, and UTC StartTime to millisecond precision from the selected process; never infer them from a name alone.',
    'The application must belong to your Windows user and interactive session and have an open main window.',
  ],
  consequences: [
    'Requests the selected main window to close; the application can refuse or display a save prompt.',
    'Does not force termination. A request is not proof of closure or repair.',
    'An application may still lose unsaved work if it handles window-close requests incorrectly.',
  ],
  rollbackInstructions: [
    'Cancel any application save/close prompt if you do not want to continue.',
    'Reopen the application after a completed close; reopening cannot recover unsaved work.',
  ],
  followUpCheckIds: ['cpu_usage_check', 'memory_usage_check'],
  requiresElevation: false, allowedParamKeys: targetKeys,
  renderScript: params => {
    const target = closeTarget(params);
    if (!target) throw new Error('A valid PID, exact processName and processStartTime are required; no script was rendered.');
    return `# Relay: request window close after explicit target review.
# Native acceptance is pending. This script does not verify a repair.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$targetPid = ${target.pid}
$expectedName = '${target.processName}'
$expectedStartTime = '${target.processStartTime}'

if ($targetPid -eq $PID) { throw 'Refusing to close the process running this script.' }
$proc = Get-Process -Id $targetPid -ErrorAction Stop
$currentSession = (Get-Process -Id $PID -ErrorAction Stop).SessionId
if ($proc.SessionId -ne $currentSession -or $proc.ProcessName -cne $expectedName -or
    $proc.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') -cne $expectedStartTime) {
    throw 'The selected process identity or session changed. No close request was sent.'
}
$record = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $targetPid" -OperationTimeoutSec 3 -ErrorAction Stop
if ($null -eq $record) { throw 'The selected process is no longer available.' }
$owner = Invoke-CimMethod -InputObject $record -MethodName GetOwnerSid -OperationTimeoutSec 3 -ErrorAction Stop
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($owner.ReturnValue -ne 0 -or [string]::IsNullOrEmpty($currentSid) -or $owner.Sid -cne $currentSid) {
    throw 'Unable to verify current-user ownership. No close request was sent.'
}
# Recheck the held process immediately before requesting its window to close.
$proc.Refresh()
if ($proc.HasExited -or $proc.Id -ne $targetPid -or $proc.SessionId -ne $currentSession -or
    $proc.ProcessName -cne $expectedName -or
    $proc.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') -cne $expectedStartTime -or
    $proc.MainWindowHandle -eq [IntPtr]::Zero) {
    throw 'The target changed or has no application window. No close request was sent.'
}
if (-not $proc.CloseMainWindow()) { throw 'The application did not accept a close request.' }
Write-Host 'Window-close request sent. Check the application for a save prompt; report the actual outcome and gather follow-up readings.'
`;
  },
}];
export function listCatalogActions(platform?: DevicePlatform): CatalogActionDefinition[] {
  return APPROVED_CATALOG_ACTIONS.filter(action => !platform || action.platform === platform);
}
export function getCatalogAction(id: string, platform: DevicePlatform): CatalogActionDefinition | null {
  return APPROVED_CATALOG_ACTIONS.find(action => action.id === id && action.platform === platform) ?? null;
}
export function createRemediationProposal(
  actionId: string, platform: DevicePlatform, evidenceIds: string[],
  params: Record<string, string | number | boolean> = {},
): RemediationProposal | null {
  const definition = getCatalogAction(actionId, platform);
  const target = closeTarget(params);
  if (!definition || !target || !boundedStrings(evidenceIds, 1)) return null;
  return {
    id: `prop-${crypto.randomUUID()}`, catalogActionId: definition.id,
    catalogVersion: definition.version, platform: definition.platform,
    evidenceIds: [...evidenceIds], parameters: { ...target },
    consequences: [...definition.consequences], rollbackInstructions: [...definition.rollbackInstructions],
    followUpCheckIds: [...definition.followUpCheckIds], requiresElevation: false,
  };
}
export function validateRemediationProposal(input: unknown): ValidationResult<RemediationProposal> {
  const fail = (error: string): ValidationResult<RemediationProposal> => ({ ok: false, error });
  if (!dataRecord(input) || Object.keys(input).length !== proposalKeys.length
    || Object.keys(input).some(key => !proposalKeys.includes(key))) return fail('Invalid proposal fields.');
  if (typeof input.id !== 'string'
    || !/^prop-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) return fail('Invalid proposal id.');
  if (input.requiresElevation !== false) return fail('Only non-elevated proposals are permitted.');
  if (typeof input.catalogActionId !== 'string' || typeof input.platform !== 'string'
    || !['windows', 'macos', 'ubuntu'].includes(input.platform)) return fail('Invalid action or platform.');
  const definition = getCatalogAction(input.catalogActionId, input.platform as DevicePlatform);
  if (!definition) return fail(getUnavailableCatalogReason(input.catalogActionId, input.platform as DevicePlatform) ?? 'This action is not approved.');
  if (input.catalogVersion !== definition.version) return fail('Unsupported catalog version. Review the current action before proceeding.');
  const target = closeTarget(input.parameters);
  if (!target || !boundedStrings(input.evidenceIds, 1)) return fail('Explicit target identity and supporting evidence references are required.');
  for (const key of ['consequences', 'rollbackInstructions', 'followUpCheckIds'] as const) {
    const value = input[key];
    if (!boundedStrings(value, 1) || value.length !== definition[key].length
      || value.some((entry, index) => entry !== definition[key][index])) return fail('Proposal text must match the reviewed catalog.');
  }
  return { ok: true, value: {
    id: input.id, catalogActionId: definition.id, catalogVersion: definition.version, platform: definition.platform,
    evidenceIds: [...input.evidenceIds], parameters: { ...target },
    consequences: [...definition.consequences], rollbackInstructions: [...definition.rollbackInstructions],
    followUpCheckIds: [...definition.followUpCheckIds], requiresElevation: false,
  } };
}
