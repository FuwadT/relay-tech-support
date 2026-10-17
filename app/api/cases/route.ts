import { and, desc, eq, lt, or } from 'drizzle-orm';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { cases } from '../../../db/schema';
import { analyzeCase, DIAGNOSTIC_RULE_VERSION } from '../../../lib/diagnostics';
import { apiError, publicCase } from '../../../lib/case-store';
import { assertMutationRequest, readJson, validateIntake } from '../../../lib/validation';
import { createIdempotentCase, parseCreateKey } from '../../../lib/idempotent-create';

interface DecodedCursor {
  updatedAt: string;
  id: string;
}

function parseCursor(cursorStr: string | null): DecodedCursor | null {
  if (!cursorStr) return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    const ts = parsed?.updatedAt || parsed?.createdAt;
    if (typeof ts === 'string' && typeof parsed?.id === 'string') {
      return { updatedAt: ts, id: parsed.id };
    }
  } catch {}
  return null;
}

function encodeCursor(item: { updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt, id: item.id })).toString('base64');
}

export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to view your cases.' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
    const limitParam = parseInt(url.searchParams.get('limit') || '25', 10);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? limitParam : 25));
    const cursor = parseCursor(url.searchParams.get('cursor'));

    if (scope === 'queue') {
      if (user.role !== 'support' && user.role !== 'admin') {
        return Response.json({ error: 'Access denied. Support role required.' }, { status: 403 });
      }
      const condition = cursor
        ? or(
            lt(cases.updatedAt, cursor.updatedAt),
            and(eq(cases.updatedAt, cursor.updatedAt), lt(cases.id, cursor.id))
          )
        : undefined;

      const rows = await getDb()
        .select()
        .from(cases)
        .where(condition)
        .orderBy(desc(cases.updatedAt), desc(cases.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1])
          : null;

      return Response.json(
        {
          cases: pageRows.map((r) => publicCase(r, user.role)),
          nextCursor,
          total: pageRows.length,
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const userCondition = eq(cases.userId, user.userId);
    const condition = cursor
      ? and(
          userCondition,
          or(
            lt(cases.updatedAt, cursor.updatedAt),
            and(eq(cases.updatedAt, cursor.updatedAt), lt(cases.id, cursor.id))
          )
        )
      : userCondition;

    const rows = await getDb()
      .select()
      .from(cases)
      .where(condition)
      .orderBy(desc(cases.updatedAt), desc(cases.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && pageRows.length > 0
        ? encodeCursor(pageRows[pageRows.length - 1])
        : null;

    return Response.json(
      {
        cases: pageRows.map((r) => publicCase(r, user.role)),
        nextCursor,
        total: pageRows.length,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error, 'list_cases');
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return Response.json({ error: 'Sign in to create a case.' }, { status: 401 });

  try {
    const body = await readJson(request);
    assertMutationRequest(request);
    const input = validateIntake(body);
    const createKey = parseCreateKey(request.headers.get('Idempotency-Key'));
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
    if (createKey !== null) {
      const result = await createIdempotentCase(getDb(), saved, createKey, input);
      if (result.outcome === 'conflict') {
        return Response.json({ error: 'This attempt already used different case details. Start a new attempt to submit changed details.' }, { status: 409 });
      }
      if (result.outcome === 'deleted') {
        return Response.json({ error: 'The case from this attempt was deleted. Start a new attempt to create a new case.' }, { status: 410 });
      }
      return Response.json({ case: publicCase(result.row, user.role), replayed: result.replayed },
        { status: result.replayed ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } });
    }
    await getDb().insert(cases).values(saved);
    return Response.json({ case: publicCase(saved, user.role) }, { status: 201 });
  } catch (error) {
    return apiError(error, 'create_case');
  }
}
