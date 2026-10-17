import { apiError } from '../../../../../lib/case-store';
import { readJson } from '../../../../../lib/validation';
import { validateTelemetrySnapshot } from '../../../../../lib/enterprise/telemetry-validation';
import { redactTelemetryPayload } from '../../../../../lib/telemetry-redactor';
import { checkRateLimit, rateLimitResponse } from '../../../../../lib/rate-limit';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;

    // Rate limit: 10 telemetry uploads / min per caseId
    const rateCheck = checkRateLimit(`telemetry:${id}`, {
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
    const parsed = validateTelemetrySnapshot(raw);

    if (!parsed.ok) {
      return Response.json(
        { ok: false, error: parsed.error },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Redact PII (user paths, private IPs, MAC addresses, API keys) before persistence
    const { payload: redacted, redactedFieldsCount } = redactTelemetryPayload(parsed.value);

    return Response.json(
      {
        ok: true,
        caseId: id,
        telemetry: redacted,
        ...(redactedFieldsCount > 0 ? { redactedFieldsCount } : {}),
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
