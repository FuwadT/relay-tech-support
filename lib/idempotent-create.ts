import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../db/schema';
import { cases, caseCreateRequests } from '../db/schema';
import type { IntakeInput } from './contracts';
import { InputError } from './validation';

export function parseCreateKey(value: string | null): string | null {
  if (value === null) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InputError('Idempotency-Key must be a UUID.');
  }
  return value.toLowerCase();
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createRequestHashes(key: string, input: IntakeInput) {
  // Input has already passed validateIntake. Explicit order ignores JSON property ordering.
  const payload = [input.title, input.description, input.deviceName, input.category,
    input.os, input.ownership, input.consent];
  const [keyHash, payloadHash] = await Promise.all([digest(key), digest(JSON.stringify(payload))]);
  return { keyHash, payloadHash };
}

export function createRequestBatch(db: DrizzleD1Database<typeof schema>, row: typeof cases.$inferSelect,
  hashes: { keyHash: string; payloadHash: string }) {
  const predicate = and(eq(caseCreateRequests.ownerId, row.userId), eq(caseCreateRequests.keyHash, hashes.keyHash));
  const reservation = db.insert(caseCreateRequests).values({ ownerId: row.userId,
    ...hashes, caseId: row.id, createdAt: row.createdAt })
    .onConflictDoNothing({ target: [caseCreateRequests.ownerId, caseCreateRequests.keyHash] });
  // D1 batch is transactional. Only the reservation winner's fresh case ID matches.
  // Never split reservation and insertion into independently committed operations.
  const insertion = db.insert(cases).select(db.select({
    id: sql`${row.id}`.as('id'), userId: sql`${row.userId}`.as('userId'), title: sql`${row.title}`.as('title'),
    description: sql`${row.description}`.as('description'), deviceName: sql`${row.deviceName}`.as('deviceName'),
    category: sql`${row.category}`.as('category'), os: sql`${row.os}`.as('os'), ownership: sql`${row.ownership}`.as('ownership'),
    status: sql`${row.status}`.as('status'), answers: sql`${JSON.stringify(row.answers)}`.as('answers'),
    measurements: sql`${JSON.stringify(row.measurements)}`.as('measurements'), ruleVersion: sql`${row.ruleVersion}`.as('ruleVersion'),
    analysisSnapshot: sql`${JSON.stringify(row.analysisSnapshot)}`.as('analysisSnapshot'), notes: sql`${row.notes}`.as('notes'),
    internalNotes: sql`${row.internalNotes}`.as('internalNotes'), assignedTo: sql`${row.assignedTo}`.as('assignedTo'),
    escalatedAt: sql`${row.escalatedAt}`.as('escalatedAt'), consent: sql`${row.consent ? 1 : 0}`.as('consent'),
    consentAt: sql`${row.consentAt}`.as('consentAt'), createdAt: sql`${row.createdAt}`.as('createdAt'),
    updatedAt: sql`${row.updatedAt}`.as('updatedAt'), verifiedAt: sql`${row.verifiedAt}`.as('verifiedAt'),
  }).from(caseCreateRequests).where(and(predicate, eq(caseCreateRequests.caseId, row.id))));
  // D1 batch returns object rows; Drizzle converts their values back to positions.
  // Selecting both tables' created_at would collapse a duplicate object key and
  // shift every later case field. Select only the uniquely named metadata needed.
  const lookup = db.select({ reservation: {
    payloadHash: caseCreateRequests.payloadHash, caseId: caseCreateRequests.caseId,
  }, case: cases })
    .from(caseCreateRequests).leftJoin(cases, and(eq(cases.id, caseCreateRequests.caseId),
      eq(cases.userId, caseCreateRequests.ownerId))).where(predicate);
  return [reservation, insertion, lookup] as const;
}

export async function createIdempotentCase(db: DrizzleD1Database<typeof schema>, row: typeof cases.$inferSelect,
  key: string, input: IntakeInput) {
  const hashes = await createRequestHashes(key, input);
  const [, , results] = await db.batch(createRequestBatch(db, row, hashes));
  const result = results[0];
  if (!result) throw new Error('Create reservation unavailable.');
  if (result.reservation.payloadHash !== hashes.payloadHash) return { outcome: 'conflict' } as const;
  if (!result.case) return { outcome: 'deleted' } as const;
  return { outcome: 'saved', row: result.case, replayed: result.reservation.caseId !== row.id } as const;
}
