import { apiError } from '../../../../../lib/case-store';
import { readJson } from '../../../../../lib/validation';
import { validateTelemetrySnapshot } from '../../../../../lib/enterprise/telemetry-validation';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const raw = await readJson(request);
    const parsed = validateTelemetrySnapshot(raw);

    if (!parsed.ok) {
      return Response.json(
        { ok: false, error: parsed.error },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    return Response.json(
      { ok: true, caseId: id, telemetry: parsed.value },
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
