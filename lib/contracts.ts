export type Category = 'performance' | 'network';
export type CaseStatus = 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';
export type Answers = Record<string, string>;

export type UserRole = 'customer' | 'support' | 'admin';

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
  role: UserRole;
}

export const CASE_STATUSES: readonly CaseStatus[] = [
  'open',
  'in_progress',
  'escalated',
  'resolved',
  'closed',
] as const;

/**
 * Sprint 4 Permission Matrix (S4-01):
 * - customer: Can create, view own cases, update answers/measurements/status/notes on own cases, delete own cases.
 *             DENIED: Accessing other users' cases, accessing support queue, viewing or editing internal notes, modifying assigned technician.
 * - support:  Can view queue, view any case, update internal notes, update assignment, update case status/notes.
 *             DENIED: Deleting customer cases (only customer purge or admin allowed).
 * - admin:    Full access to all operations including deleting cases, assigning technicians, queue management.
 */
export type PermissionAction =
  | 'view_queue'
  | 'view_any_case'
  | 'view_internal_notes'
  | 'edit_internal_notes'
  | 'assign_technician'
  | 'delete_any_case';

export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionAction[]> = {
  customer: [],
  support: ['view_queue', 'view_any_case', 'view_internal_notes', 'edit_internal_notes', 'assign_technician'],
  admin: ['view_queue', 'view_any_case', 'view_internal_notes', 'edit_internal_notes', 'assign_technician', 'delete_any_case'],
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function canAccessQueue(role: UserRole): boolean {
  return role === 'support' || role === 'admin';
}

export function canViewInternalNotes(role: UserRole): boolean {
  return role === 'support' || role === 'admin';
}

export function canEditSupportFields(role: UserRole): boolean {
  return role === 'support' || role === 'admin';
}

export interface MeasurementDefinition {
  id: string;
  label: string;
  unit: string;
  instruction: string;
  min?: number;
  max?: number;
}

export type MeasurementValues = Record<string, number | null>;

export interface CaseMeasurements {
  baseline?: MeasurementValues;
  followUp?: MeasurementValues;
}

export type ComparisonDirection = 'improved' | 'worsened' | 'unchanged' | 'incomplete';

export interface MeasurementComparison {
  id: string;
  label: string;
  unit: string;
  baseline: number | null;
  followUp: number | null;
  difference: number | null;
  direction: ComparisonDirection;
}

export interface CaseRecord {
  id: string;
  userId?: string;
  title: string;
  description: string;
  deviceName: string;
  category: Category;
  os: 'windows11';
  ownership: 'personal';
  status: CaseStatus;
  answers: Answers;
  measurements: CaseMeasurements;
  ruleVersion: string;
  analysisSnapshot?: Analysis | null;
  notes: string;
  internalNotes?: string;
  assignedTo?: string | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
}

export interface IntakeInput {
  title: string;
  description: string;
  deviceName: string;
  category: Category;
  os: string;
  ownership: string;
  consent: boolean;
}

export interface DiagnosticCheck {
  id: string;
  title: string;
  instruction: string;
  reason: string;
  options: { value: string; label: string }[];
}

export type AIExplanationProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deterministic-fallback'
  | 'simulated';

export interface AIExplanation {
  summary: string;
  likelyCauses: string[];
  recommendedCheckIds: string[];
  cautions: string[];
  evidenceUsed: string[];
  provider: AIExplanationProvider;
  latencyMs: number;
  generatedAt: string;
}

export interface Analysis {
  headline: string;
  summary: string;
  findings: string[];
  nextSteps: string[];
  limitations: string[];
  ruleVersion: string;
  evidenceUsed: string[];
  comparisons?: MeasurementComparison[];
  aiExplanation?: AIExplanation | null;
}

