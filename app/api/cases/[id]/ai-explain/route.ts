import { apiError } from '../../../../../lib/case-store';
import { readJson } from '../../../../../lib/validation';

// A stale client may still POST here. Consume its bounded JSON before returning
// the unsupported-capability response so the local Worker can serve its next
// request. This guided build contains no model adapter or model calls.
export async function POST(request: Request) {
  try {
    await readJson(request);
    return Response.json(
      { error: 'AI explanations are not enabled in this guided build.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
