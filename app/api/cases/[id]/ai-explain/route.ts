import { apiError } from '../../../../../lib/case-store';
import { readJson } from '../../../../../lib/validation';
import { explainTelemetryQuestion } from '../../../../../lib/enterprise/findings';
import type { TelemetrySnapshot, EvidenceFinding } from '../../../../../lib/enterprise/contracts';

export async function POST(request: Request) {
  try {
    const rawBody = await readJson(request);

    // If running in guided-only verification mode, maintain 404 response
    if (process.env.RELAY_GUIDED_ONLY === '1') {
      return Response.json(
        { error: 'AI explanations are not enabled in this guided build.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const body = (rawBody || {}) as {
      question?: string;
      snapshot?: TelemetrySnapshot;
      findings?: EvidenceFinding[];
      symptomCategory?: string;
    };

    if (!body.question || !body.snapshot) {
      return Response.json(
        { error: 'Question and telemetry snapshot are required for contextual explanation.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const answer = explainTelemetryQuestion(
      body.question,
      body.snapshot,
      body.findings || [],
      body.symptomCategory || 'general',
    );

    return Response.json(
      { ok: true, answer },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
