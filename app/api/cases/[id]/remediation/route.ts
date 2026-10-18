import { eq } from 'drizzle-orm';
import { getDb } from '../../../../../db';
import { cases } from '../../../../../db/schema';
import { apiError } from '../../../../../lib/case-store';
import { readJson } from '../../../../../lib/validation';
import { validateTelemetrySnapshot } from '../../../../../lib/enterprise/telemetry-validation';
import { verifyRemediationDelta, type RemediationDiff } from '../../../../../lib/enterprise/findings';
import {
  getRemediationCatalogItem,
  getRemediationCommand,
  REMEDIATION_CATALOG_ITEMS,
} from '../../../../../lib/enterprise/remediation-catalog';
import { checkRateLimit, rateLimitResponse } from '../../../../../lib/rate-limit';
import type { DevicePlatform } from '../../../../../lib/enterprise/contracts';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const platform = (url.searchParams.get('platform') || 'windows11') as DevicePlatform | 'windows11';
    const actionId = url.searchParams.get('actionId') || 'catalog-net-flush-dns';

    // Rate limit: 20 requests / min per caseId
    const rateCheck = checkRateLimit(`remediation:get:${id}`, {
      windowMs: 60_000,
      maxRequests: 20,
    });
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const item = getRemediationCatalogItem(actionId);
    const command = getRemediationCommand(actionId, platform);

    return Response.json(
      {
        ok: true,
        caseId: id,
        item: item ?? REMEDIATION_CATALOG_ITEMS['catalog-net-flush-dns'],
        command: command ?? 'ipconfig /flushdns',
        catalog: Object.values(REMEDIATION_CATALOG_ITEMS),
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;

    // Rate limit: 10 remediation verifications / min per caseId
    const rateCheck = checkRateLimit(`remediation:post:${id}`, {
      windowMs: 60_000,
      maxRequests: 10,
    });
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    // Enforce 64 KB payload size guard before JSON parsing
    const contentLength = Number(request.headers.get('content-length'));
    if (contentLength > 65_536) {
      return Response.json(
        { ok: false, error: 'Payload exceeds 64 KB limit.' },
        { status: 413, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const raw = await readJson(request);
    if (!raw || typeof raw !== 'object') {
      return Response.json(
        { ok: false, error: 'Invalid request body.' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const body = raw as {
      beforeSnapshot?: unknown;
      afterSnapshot?: unknown;
      actionId?: string;
      executedCommand?: string;
    };

    if (!body.beforeSnapshot || !body.afterSnapshot) {
      return Response.json(
        { ok: false, error: 'Both beforeSnapshot and afterSnapshot are required for delta verification.' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const beforeValid = validateTelemetrySnapshot(body.beforeSnapshot);
    if (beforeValid.ok === false) {
      return Response.json(
        { ok: false, error: `Invalid beforeSnapshot: ${beforeValid.error}` },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const afterValid = validateTelemetrySnapshot(body.afterSnapshot);
    if (afterValid.ok === false) {
      return Response.json(
        { ok: false, error: `Invalid afterSnapshot: ${afterValid.error}` },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const diffs: RemediationDiff[] = verifyRemediationDelta(beforeValid.value, afterValid.value);
    const anyImproved = diffs.some((d) => d.improved);
    const nowIso = new Date().toISOString();

    // Persist verified outcome to case if exists in db
    try {
      const db = getDb();
      await db
        .update(cases)
        .set({
          status: anyImproved ? 'resolved' : undefined,
          verifiedAt: anyImproved ? nowIso : undefined,
          updatedAt: nowIso,
        })
        .where(eq(cases.id, id));
    } catch {
      // Non-blocking in fixture/ephemeral mode
    }

    return Response.json(
      {
        ok: true,
        caseId: id,
        actionId: body.actionId ?? 'catalog-net-flush-dns',
        executedCommand: body.executedCommand ?? null,
        status: anyImproved ? 'resolved_verified' : 'investigating',
        diffs,
        verified: anyImproved,
        verifiedAt: anyImproved ? nowIso : null,
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
