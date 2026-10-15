import { and, eq } from 'drizzle-orm';
import { cases } from '../db/schema';
import type { CaseRecord, UserRole } from './contracts';
import { InputError } from './validation';

export const ownedCase = (id: string, userId: string) => and(eq(cases.id, id), eq(cases.userId, userId));

export function publicCase(row: typeof cases.$inferSelect, role: UserRole = 'customer'): CaseRecord {
  const result: CaseRecord = {
    id: row.id,
    title: row.title,
    description: row.description,
    deviceName: row.deviceName,
    category: row.category,
    os: row.os,
    ownership: row.ownership,
    status: row.status,
    answers: row.answers,
    measurements: row.measurements ?? {},
    ruleVersion: row.ruleVersion ?? '1.0.0',
    analysisSnapshot: row.analysisSnapshot ?? null,
    notes: row.notes,
    assignedTo: row.assignedTo ?? null,
    escalatedAt: row.escalatedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    verifiedAt: row.verifiedAt,
  };

  if (role === 'support' || role === 'admin') {
    result.internalNotes = row.internalNotes ?? '';
    result.userId = row.userId;
  }

  return result;
}

const operations = ['list_cases', 'create_case', 'read_case', 'update_case', 'delete_case', 'ai_explanation', 'unknown'] as const;
export type CaseOperation = typeof operations[number];

export function apiError(error: unknown, operation: CaseOperation = 'unknown'): Response {
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
  const requestId = crypto.randomUUID();
  // Do not log database error text: it may contain customer SQL parameters.
  const safeOperation = operations.includes(operation) ? operation : 'unknown';
  const failureType = error instanceof TypeError ? 'type_error'
    : error instanceof RangeError ? 'range_error'
    : error instanceof SyntaxError ? 'syntax_error' : 'unexpected_error';
  console.error(JSON.stringify({ event: 'case_operation_failed', requestId, operation: safeOperation, failureType }));
  return Response.json({ error: `Unable to save or load cases. Please try again. Reference: ${requestId}`, requestId }, { status: 500 });
}
