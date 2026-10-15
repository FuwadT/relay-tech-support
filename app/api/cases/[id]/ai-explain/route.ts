import { eq } from 'drizzle-orm';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { cases } from '@/db/schema';
import { generateCaseAIExplanation } from '@/lib/ai-provider';
import { checkAndRecordCaseAIUsage } from '@/lib/ai-rate-limiter';
import { apiError, ownedCase } from '@/lib/case-store';
import { analyzeCase } from '@/lib/diagnostics';
import { assertMutationRequest, readJson } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  // Read body before any assertions to prevent worker stream hang
  await readJson(request);
  assertMutationRequest(request);

  const user = await getChatGPTUser(request);
  if (!user) {
    return Response.json({ error: 'Sign in to request an AI explanation.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const db = getDb();
    const isStaff = user.role === 'support' || user.role === 'admin';
    const condition = isStaff ? eq(cases.id, id) : ownedCase(id, user.userId);

    const [row] = await db.select().from(cases).where(condition).limit(1);
    if (!row) {
      return Response.json({ error: 'Case not found.' }, { status: 404 });
    }

    // Apply per-case rate limiting and cooldown (S5-05)
    const rateLimit = checkAndRecordCaseAIUsage(id);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: rateLimit.error,
          remaining: rateLimit.remaining,
        },
        { status: 429 }
      );
    }

    // Generate evidence-grounded AI explanation (S5-02, S5-03, S5-04)
    const aiExplanation = await generateCaseAIExplanation({
      caseId: id,
      category: row.category,
      title: row.title,
      description: row.description,
      answers: row.answers,
      measurements: row.measurements ?? {},
    });

    // Preserve existing analysis snapshot and attach newly generated AI explanation
    const baseSnapshot = row.analysisSnapshot ?? analyzeCase({
      ...row,
      measurements: row.measurements ?? undefined,
    });
    const updatedSnapshot = {
      ...baseSnapshot,
      aiExplanation,
    };

    const now = new Date().toISOString();
    await db
      .update(cases)
      .set({
        analysisSnapshot: updatedSnapshot,
        updatedAt: now,
      })
      .where(eq(cases.id, id))
      .run();

    return Response.json(
      {
        ok: true,
        aiExplanation,
        analysisSnapshot: updatedSnapshot,
        remaining: rateLimit.remaining,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
