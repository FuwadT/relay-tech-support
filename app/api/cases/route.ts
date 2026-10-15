import { desc, eq } from 'drizzle-orm';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { cases } from '../../../db/schema';
import { analyzeCase, DIAGNOSTIC_RULE_VERSION } from '../../../lib/diagnostics';
import { apiError, publicCase } from '../../../lib/case-store';
import { assertMutationRequest, readJson, validateIntake } from '../../../lib/validation';

export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to view your cases.' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');

    if (scope === 'queue') {
      if (user.role !== 'support' && user.role !== 'admin') {
        return Response.json({ error: 'Access denied. Support role required.' }, { status: 403 });
      }
      const rows = await getDb()
        .select()
        .from(cases)
        .orderBy(desc(cases.updatedAt))
        .limit(200);
      return Response.json(
        { cases: rows.map((r) => publicCase(r, user.role)) },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const rows = await getDb()
      .select()
      .from(cases)
      .where(eq(cases.userId, user.userId))
      .orderBy(desc(cases.updatedAt))
      .limit(200);
    return Response.json(
      { cases: rows.map((r) => publicCase(r, user.role)) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to create a case.' }, { status: 401 });

  try {
    const body = await readJson(request);
    assertMutationRequest(request);
    const input = validateIntake(body);
    const now = new Date().toISOString();
    const row = {
      ...input,
      os: 'windows11' as const,
      ownership: 'personal' as const,
      id: crypto.randomUUID(),
      userId: user.userId,
      status: 'open' as const,
      answers: {},
      measurements: {},
      ruleVersion: '1.0.0',
      notes: '',
      internalNotes: '',
      assignedTo: null,
      escalatedAt: null,
      consentAt: now,
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
    };
    const saved = { ...row, ruleVersion: DIAGNOSTIC_RULE_VERSION, analysisSnapshot: analyzeCase(row) };
    await getDb().insert(cases).values(saved);
    return Response.json({ case: publicCase(saved, user.role) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
