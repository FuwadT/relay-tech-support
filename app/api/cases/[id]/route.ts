import { eq } from 'drizzle-orm';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { getDb } from '../../../../db';
import { cases } from '../../../../db/schema';
import { analyzeCase, DIAGNOSTIC_RULE_VERSION } from '../../../../lib/diagnostics';
import { apiError, ownedCase, publicCase } from '../../../../lib/case-store';
import { assertMutationRequest, readJson, validatePatch, validateSupportPatch } from '../../../../lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to view this case.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const isStaff = user.role === 'support' || user.role === 'admin';
    const condition = isStaff ? eq(cases.id, id) : ownedCase(id, user.userId);
    const [row] = await getDb().select().from(cases).where(condition).limit(1);
    if (!row) return Response.json({ error: 'Case not found.' }, { status: 404 });

    const roleForOutput = isStaff ? user.role : 'customer';
    return Response.json(
      { case: publicCase(row, roleForOutput) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to update this case.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await readJson(request);
    assertMutationRequest(request);
    const db = getDb();
    const now = new Date().toISOString();

    const isStaff = user.role === 'support' || user.role === 'admin';

    if (!isStaff) {
      // Customer path
      // Cannot update internalNotes or assignedTo (403 Forbidden)
      if (typeof body === 'object' && body !== null) {
        const raw = body as Record<string, unknown>;
        if ('internalNotes' in raw || 'assignedTo' in raw) {
          return Response.json(
            { error: 'Access denied. Internal notes and assignments are restricted to support staff.' },
            { status: 403 }
          );
        }
      }

      const [row] = await db.select().from(cases).where(ownedCase(id, user.userId)).limit(1);
      if (!row) return Response.json({ error: 'Case not found.' }, { status: 404 });

      const patch = validatePatch(body, row.category);
      const updatedAnswers = patch.answers ? { ...row.answers, ...patch.answers } : row.answers;
      const existingMeas = row.measurements ?? {};
      const updatedMeas = patch.measurements
        ? {
            baseline: { ...(existingMeas.baseline ?? {}), ...(patch.measurements.baseline ?? {}) },
            followUp: { ...(existingMeas.followUp ?? {}), ...(patch.measurements.followUp ?? {}) },
          }
        : existingMeas;

      const escalatedAt =
        patch.status === 'escalated'
          ? (row.escalatedAt ?? now)
          : patch.status
          ? (patch.status === 'resolved' || patch.status === 'closed' ? row.escalatedAt : null)
          : row.escalatedAt;

      const verifiedAt =
        patch.status === 'resolved'
          ? now
          : patch.status
          ? null
          : row.verifiedAt;

      const updates: Partial<typeof cases.$inferInsert> = {
        ...patch,
        answers: updatedAnswers,
        measurements: updatedMeas,
        escalatedAt,
        verifiedAt,
        updatedAt: now,
      };

      const evidenceChanged = patch.answers !== undefined || patch.measurements !== undefined;
      const provenance =
        evidenceChanged || !row.analysisSnapshot
          ? {
              ruleVersion: DIAGNOSTIC_RULE_VERSION,
              analysisSnapshot: analyzeCase({
                category: row.category,
                answers: updatedAnswers,
                measurements: updatedMeas,
                ruleVersion: DIAGNOSTIC_RULE_VERSION,
              }),
            }
          : {};

      const [updated] = await db
        .update(cases)
        .set({ ...updates, ...provenance })
        .where(ownedCase(id, user.userId))
        .returning();

      if (!updated) return Response.json({ error: 'Case not found.' }, { status: 404 });
      return Response.json({ case: publicCase(updated, 'customer') });
    } else {
      // Support or Admin path
      const [row] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
      if (!row) return Response.json({ error: 'Case not found.' }, { status: 404 });

      const patch = validateSupportPatch(body);

      const escalatedAt =
        patch.status === 'escalated'
          ? (row.escalatedAt ?? now)
          : row.escalatedAt;

      const updates: Partial<typeof cases.$inferInsert> = {
        updatedAt: now,
      };

      if (patch.status !== undefined) {
        updates.status = patch.status;
        updates.escalatedAt = escalatedAt;
        // Staff status changes do NOT overwrite customer verifiedAt
      }
      if (patch.notes !== undefined) {
        updates.notes = patch.notes;
      }
      if (patch.internalNotes !== undefined) {
        updates.internalNotes = patch.internalNotes;
      }
      if (patch.assignedTo !== undefined) {
        updates.assignedTo = patch.assignedTo;
      }

      const [updated] = await db
        .update(cases)
        .set(updates)
        .where(eq(cases.id, id))
        .returning();

      if (!updated) return Response.json({ error: 'Case not found.' }, { status: 404 });
      return Response.json({ case: publicCase(updated, user.role) });
    }
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to delete this case.' }, { status: 401 });

  try {
    assertMutationRequest(request);
    const { id } = await context.params;

    // Customer can only delete ownedCase(id, user.userId)
    // Support operators cannot delete customer cases
    // Admin can delete any case
    if (user.role === 'support') {
      return Response.json(
        { error: 'Support operators cannot delete customer cases. Only case owners or administrators may purge cases.' },
        { status: 403 }
      );
    }

    const condition = user.role === 'admin' ? eq(cases.id, id) : ownedCase(id, user.userId);
    const removed = await getDb().delete(cases).where(condition).returning({ id: cases.id });
    if (!removed.length) return Response.json({ error: 'Case not found.' }, { status: 404 });

    return Response.json({
      ok: true,
      deletedId: id,
      policy: 'Customer-requested permanent purge complete.',
    });
  } catch (error) {
    return apiError(error);
  }
}
