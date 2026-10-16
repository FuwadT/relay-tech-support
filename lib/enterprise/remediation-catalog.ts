/**
 * Reviewed Remediation Catalog (Task E7-01).
 *
 * Implements strict constraints per ENTERPRISE-PLAN.md:
 * - Versioned low-risk, reversible catalog actions per OS
 * - Non-elevated only (requiresElevation: false)
 * - Excludes: force-kill (SIGKILL / kill -9), privileged service mutations,
 *   destructive recursive deletes (rm -rf), registry edits, and elevation prompts (sudo / UAC).
 * - Scripts show preconditions, consequences, rollback instructions, and follow-up checks.
 * - An execution report does not independently verify repair or auto-resolve cases.
 */

import type {
  DevicePlatform,
  RemediationProposal,
  ValidationResult,
} from './contracts';

export const REMEDIATION_CATALOG_VERSION = '1.0.0' as const;

export interface CatalogActionDefinition {
  id: string;
  version: string;
  platform: DevicePlatform;
  title: string;
  description: string;
  prerequisites: string[];
  consequences: string[];
  rollbackInstructions: string[];
  followUpCheckIds: string[];
  requiresElevation: false;
  allowedParamKeys: readonly string[];
  renderScript: (params: Record<string, string | number | boolean>) => string;
}

/**
 * Approved Catalog Actions.
 * All scripts are strictly non-elevated and non-destructive.
 */
export const APPROVED_CATALOG_ACTIONS: readonly CatalogActionDefinition[] = [
  // ─── Windows 11 Actions ──────────────────────────────────────────────────
  {
    id: 'win-net-flush-dns-cache',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'windows',
    title: 'Flush Local DNS Client Cache',
    description: 'Clears the local Windows DNS resolver cache to resolve stale or incorrect hostname mappings.',
    prerequisites: [
      'Active network interface present',
      'No active file downloads relying on pending hostnames',
    ],
    consequences: [
      'Local cached DNS records are cleared immediately.',
      'Subsequent network requests will perform a fresh recursive DNS query.',
      'Active established TCP connections remain completely unaffected.',
    ],
    rollbackInstructions: [
      'No rollback required. Hostnames are re-cached dynamically upon subsequent resolution requests.',
    ],
    followUpCheckIds: ['dns_resolution_check', 'gateway_latency_check'],
    requiresElevation: false,
    allowedParamKeys: [],
    renderScript: () => `# Relay Remediation: Flush Local DNS Cache
# Environment: Non-elevated user execution
# Consequence: Clears local cached DNS entries; does not alter system configuration.

Clear-DnsClientCache
Write-Host "DNS client cache successfully flushed." -ForegroundColor Green
`,
  },
  {
    id: 'win-disk-clean-user-temp',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'windows',
    title: 'Clean Stale User Temporary Files',
    description: 'Removes temporary files older than 7 days from the user temporary directory (%TEMP%).',
    prerequisites: [
      'Close open document editors or installers that may be actively writing temporary files',
    ],
    consequences: [
      'Deletes unpinned temporary files older than 7 days from user-specific $env:TEMP.',
      'Does NOT delete system temporary files, registry entries, or application data.',
    ],
    rollbackInstructions: [
      'Temporary files cannot be restored from the recycle bin. Ensure work was saved before executing.',
    ],
    followUpCheckIds: ['disk_free_gb_check'],
    requiresElevation: false,
    allowedParamKeys: ['daysOld'],
    renderScript: (params) => {
      const days = typeof params.daysOld === 'number' && params.daysOld >= 7 ? Math.floor(params.daysOld) : 7;
      return `# Relay Remediation: Clean Stale User Temp Files
# Target: User temporary folder only ($env:TEMP)
# Threshold: Files older than ${days} days

$cutoff = (Get-Date).AddDays(-${days})
Get-ChildItem -Path $env:TEMP -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Stale user temporary files cleaned." -ForegroundColor Green
`;
    },
  },
  {
    id: 'win-proc-graceful-request',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'windows',
    title: 'Request Graceful Process Close',
    description: 'Sends a standard close notification to a non-responsive user-owned application.',
    prerequisites: [
      'Confirm the target process PID belongs to your own user account',
      'Save work in any other open windows of the application',
    ],
    consequences: [
      'Sends a graceful WM_CLOSE request to the process window.',
      'Does NOT use -Force or terminate kernel/system threads.',
    ],
    rollbackInstructions: [
      'Re-launch the application from your Start Menu or taskbar.',
    ],
    followUpCheckIds: ['cpu_usage_check', 'memory_usage_check'],
    requiresElevation: false,
    allowedParamKeys: ['pid', 'processName'],
    renderScript: (params) => {
      const pid = typeof params.pid === 'number' ? Math.floor(params.pid) : 0;
      return `# Relay Remediation: Graceful Process Termination Request
# Target PID: ${pid} (Non-elevated, non-forced)

$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($proc -and $proc.SessionId -eq (Get-Process -Id $PID).SessionId) {
    # Non-forced graceful close request
    $proc.CloseMainWindow() | Out-Null
    Write-Host "Sent graceful close request to process PID ${pid}." -ForegroundColor Green
} else {
    Write-Host "Process not found or belongs to another session; skipped." -ForegroundColor Yellow
}
`;
    },
  },

  // ─── macOS Actions (Apple Silicon) ────────────────────────────────────────
  {
    id: 'mac-net-flush-dns',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'macos',
    title: 'Refresh Local mDNS Resolver Cache',
    description: 'Refreshes local multicast DNS cache without modifying system networking configurations.',
    prerequisites: [
      'No active file transfers in progress',
    ],
    consequences: [
      'Notifies mDNSResponder to invalidate local cache entries.',
      'Active network socket connections remain open and uninterrupted.',
    ],
    rollbackInstructions: [
      'No rollback required. Hostnames are re-resolved on subsequent outbound connections.',
    ],
    followUpCheckIds: ['dns_resolution_check'],
    requiresElevation: false,
    allowedParamKeys: [],
    renderScript: () => `#!/usr/bin/env zsh
# Relay Remediation: Refresh mDNS Cache (macOS)
# Strictly non-elevated user execution

killall -HUP mDNSResponder 2>/dev/null || true
echo "DNS responder notification sent."
`,
  },
  {
    id: 'mac-proc-graceful-term',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'macos',
    title: 'Send Graceful Termination Signal (SIGTERM)',
    description: 'Sends a standard SIGTERM (signal 15) to request that a user application exit gracefully.',
    prerequisites: [
      'Ensure the process PID belongs to your own user session',
    ],
    consequences: [
      'Requests graceful exit; allows process to save state, flush buffers, and close handles.',
      'NEVER issues SIGKILL (kill -9) or affects privileged system services.',
    ],
    rollbackInstructions: [
      'Re-open the application from Finder or Dock.',
    ],
    followUpCheckIds: ['cpu_usage_check', 'memory_usage_check'],
    requiresElevation: false,
    allowedParamKeys: ['pid'],
    renderScript: (params) => {
      const pid = typeof params.pid === 'number' ? Math.floor(params.pid) : 0;
      return `#!/usr/bin/env zsh
# Relay Remediation: Graceful SIGTERM Request (macOS)
# Target PID: ${pid}

if kill -0 ${pid} 2>/dev/null; then
  # Graceful signal 15 (SIGTERM), never -9
  kill -15 ${pid}
  echo "Graceful termination signal sent to PID ${pid}."
else
  echo "Process ${pid} is not running or not accessible."
fi
`;
    },
  },

  // ─── Ubuntu Actions (x64) ────────────────────────────────────────────────
  {
    id: 'ubuntu-net-flush-resolve-cache',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'ubuntu',
    title: 'Flush User-Accessible DNS Caches',
    description: 'Flushes local resolver caches accessible to the standard user session.',
    prerequisites: [
      'Network adapter connected',
    ],
    consequences: [
      'Flushes local systemd-resolved cache if permissions allow, or notifies local resolver.',
      'Preserves all static network interface configurations and DNS server assignments.',
    ],
    rollbackInstructions: [
      'No rollback required. Dynamic name resolution continues automatically.',
    ],
    followUpCheckIds: ['dns_resolution_check'],
    requiresElevation: false,
    allowedParamKeys: [],
    renderScript: () => `#!/usr/bin/env bash
# Relay Remediation: Flush Local DNS Caches (Ubuntu)
# Strictly non-elevated execution

if command -v resolvectl >/dev/null 2>&1; then
  resolvectl flush-caches 2>/dev/null || true
elif command -v systemd-resolve >/dev/null 2>&1; then
  systemd-resolve --flush-caches 2>/dev/null || true
fi
echo "Local resolver cache flush executed."
`,
  },
  {
    id: 'ubuntu-proc-graceful-term',
    version: REMEDIATION_CATALOG_VERSION,
    platform: 'ubuntu',
    title: 'Send Graceful SIGTERM to User Process',
    description: 'Sends a standard SIGTERM (15) to request that a user process terminate cleanly.',
    prerequisites: [
      'Target PID must belong to the current user ($UID)',
    ],
    consequences: [
      'Sends SIGTERM (15) allowing clean shutdown and file write completion.',
      'NEVER uses kill -9 or elevated capabilities.',
    ],
    rollbackInstructions: [
      'Re-launch the program from application launcher or terminal.',
    ],
    followUpCheckIds: ['cpu_usage_check', 'memory_usage_check'],
    requiresElevation: false,
    allowedParamKeys: ['pid'],
    renderScript: (params) => {
      const pid = typeof params.pid === 'number' ? Math.floor(params.pid) : 0;
      return `#!/usr/bin/env bash
# Relay Remediation: Graceful SIGTERM (Ubuntu)
# Target PID: ${pid}

if kill -0 ${pid} 2>/dev/null; then
  # SIGTERM 15 only — never -9
  kill -15 ${pid}
  echo "SIGTERM sent to PID ${pid}."
else
  echo "Process ${pid} not active in user session."
fi
`;
    },
  },
];

/**
 * Returns all catalog action definitions for a given platform.
 */
export function listCatalogActions(platform?: DevicePlatform): CatalogActionDefinition[] {
  if (!platform) return [...APPROVED_CATALOG_ACTIONS];
  return APPROVED_CATALOG_ACTIONS.filter((a) => a.platform === platform);
}

/**
 * Retrieves a specific catalog action definition by ID and platform.
 */
export function getCatalogAction(id: string, platform: DevicePlatform): CatalogActionDefinition | null {
  return APPROVED_CATALOG_ACTIONS.find((a) => a.id === id && a.platform === platform) || null;
}

/**
 * Constructs a valid RemediationProposal from an approved catalog definition.
 * Models select the action ID and supply validated parameters; they do NOT generate scripts.
 */
export function createRemediationProposal(
  actionId: string,
  platform: DevicePlatform,
  evidenceIds: string[],
  params: Record<string, string | number | boolean> = {},
): RemediationProposal | null {
  const definition = getCatalogAction(actionId, platform);
  if (!definition) return null;

  // Filter parameters to only allow approved parameter keys
  const safeParams: Record<string, string | number | boolean> = {};
  for (const key of definition.allowedParamKeys) {
    if (key in params) {
      safeParams[key] = params[key];
    }
  }

  return {
    id: `prop-${crypto.randomUUID()}`,
    catalogActionId: definition.id,
    catalogVersion: definition.version,
    platform: definition.platform,
    evidenceIds: [...evidenceIds],
    parameters: safeParams,
    consequences: [...definition.consequences],
    rollbackInstructions: [...definition.rollbackInstructions],
    followUpCheckIds: [...definition.followUpCheckIds],
    requiresElevation: false,
  };
}

/**
 * Validates a proposed remediation object against safety constraints.
 * Rejects any proposal with requiresElevation: true or unapproved action IDs.
 */
export function validateRemediationProposal(input: unknown): ValidationResult<RemediationProposal> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Remediation proposal must be a valid object.' };
  }
  const p = input as Partial<RemediationProposal>;

  if (typeof p.id !== 'string' || !p.id.trim()) {
    return { ok: false, error: 'Proposal requires a valid string id.' };
  }
  if (typeof p.catalogActionId !== 'string') {
    return { ok: false, error: 'Proposal requires a valid catalogActionId.' };
  }
  if (p.requiresElevation !== false) {
    return { ok: false, error: 'Security violation: only non-elevated catalog actions (requiresElevation: false) are permitted.' };
  }
  if (!p.platform || !['windows', 'macos', 'ubuntu'].includes(p.platform)) {
    return { ok: false, error: 'Invalid device platform specified.' };
  }

  const def = getCatalogAction(p.catalogActionId, p.platform as DevicePlatform);
  if (!def) {
    return { ok: false, error: `Catalog action "${p.catalogActionId}" is not approved for platform "${p.platform}".` };
  }

  if (!Array.isArray(p.evidenceIds) || p.evidenceIds.some((e) => typeof e !== 'string')) {
    return { ok: false, error: 'evidenceIds must be an array of strings.' };
  }

  return {
    ok: true,
    value: {
      id: p.id,
      catalogActionId: def.id,
      catalogVersion: def.version,
      platform: def.platform,
      evidenceIds: p.evidenceIds,
      parameters: (p.parameters && typeof p.parameters === 'object') ? p.parameters : {},
      consequences: [...def.consequences],
      rollbackInstructions: [...def.rollbackInstructions],
      followUpCheckIds: [...def.followUpCheckIds],
      requiresElevation: false,
    },
  };
}
