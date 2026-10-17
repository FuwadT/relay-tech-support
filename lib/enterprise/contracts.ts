/** Enterprise v2 contracts. Deliberately separate from the legacy Sites DTOs. */
export const ENTERPRISE_CONTRACT_VERSION = 1 as const;
export type OrganizationRole = 'requester' | 'technician' | 'administrator';
export type IdentityProvider = 'entra' | 'google';
export type DevicePlatform = 'windows' | 'macos' | 'ubuntu';
export type EvidenceSource = 'collector' | 'user-reported' | 'synthetic';
export type EnterpriseCaseStatus = 'open' | 'investigating' | 'awaiting_user' | 'escalated' | 'resolved' | 'closed';

/** Server-only: constructed from a hashed session lookup plus active membership. */
export interface EnterprisePrincipal {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  sessionId: string;
}
export interface EnterpriseCaseInput {
  title: string;
  description: string;
  platform: DevicePlatform;
  deviceAuthorization: true;
  storageConsent: true;
}
export interface EnterpriseCase {
  id: string;
  organizationId: string;
  requesterId: string;
  title: string;
  description: string;
  platform: DevicePlatform;
  status: EnterpriseCaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionError { checkId: string; code: 'unavailable' | 'permission_denied' | 'timeout' | 'unsupported'; }
export interface ProcessSample {
  pid: number;
  name: string;
  /** Percent of total machine capacity, normalized across logical processors. */
  cpuPercent: number | null;
  memoryMb: number | null;
}
export interface TelemetrySnapshot {
  schemaVersion: 1;
  collectionId: string;
  platform: DevicePlatform;
  osVersion: string;
  architecture: 'x64' | 'arm64';
  source: EvidenceSource;
  collectorVersion: string | null;
  collectedAt: string;
  sampleIntervalMs: number | null;
  cpuPercent: number | null;
  memoryTotalMb: number | null;
  memoryUsedMb: number | null;
  diskTotalGb: number | null;
  diskFreeGb: number | null;
  dnsResolved: boolean | null;
  gatewayLatencyMs: number | null;
  processes: ProcessSample[];
  /** Already-redacted, bounded excerpts; no complete logs or process command lines. */
  eventExcerpts: { eventId: string; text: string }[];
  errors: CollectionError[];
}
export interface EvidenceFinding {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  observation: string;
  hypothesis: string | null;
  evidenceIds: string[];
  recommendedCheckIds: string[];
  ruleVersion: string;
}
export interface RemediationProposal {
  id: string;
  catalogActionId: string;
  catalogVersion: string;
  platform: DevicePlatform;
  evidenceIds: string[];
  parameters: Record<string, string | number | boolean>;
  consequences: string[];
  rollbackInstructions: string[];
  followUpCheckIds: string[];
  requiresElevation: false;
}
export interface ExecutionReport {
  proposalId: string;
  reportedBy: string;
  reportedAt: string;
  outcome: 'not_run' | 'reported_success' | 'reported_failure' | 'unknown';
  followUpCollectionId: string | null;
}
export type ModelProvider = 'openai' | 'anthropic' | 'gemini';
export type TicketingProvider = 'servicenow' | 'jira-service-management' | 'freshservice';
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type EnterpriseTriageStage =
  | 'intake_discovery'
  | 'deductive_questioning'
  | 'browser_probe'
  | 'awaiting_authorization'
  | 'awaiting_telemetry'
  | 'active_investigation';

export interface TriageHypothesis {
  id: string;
  domain: 'cpu_thermal' | 'memory' | 'disk_io' | 'network_dns' | 'application' | 'permissions';
  summary: string;
  confidence: number; // 0.0 - 1.0
  status: 'active' | 'ruled_out' | 'confirmed';
}

export interface DeductiveTriageResponse {
  stage: EnterpriseTriageStage;
  reply: string;
  quickReplies: string[];
  hypotheses: TriageHypothesis[];
  recommendedAction: 'ask_clarifying_question' | 'run_browser_probe' | 'request_os_collector' | 'propose_remediation' | 'escalate';
  addressedSymptomMismatch?: boolean;
  isFallback?: boolean;
  fallbackReason?: string;
  providerUsed?: string;
  modelUsed?: string;
}

