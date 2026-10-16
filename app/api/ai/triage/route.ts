import { apiError } from '../../../../lib/case-store';
import { readJson } from '../../../../lib/validation';
import { executeDeductiveTriage, type DeductiveTriageRequest } from '../../../../lib/enterprise/ai-provider-adapter';
import type {
  EnterpriseTriageStage,
  EvidenceFinding,
  ModelProvider,
  TelemetrySnapshot,
  TriageHypothesis,
} from '../../../../lib/enterprise/contracts';

export async function POST(request: Request) {
  try {
    const rawBody = await readJson(request);
    const body = (rawBody || {}) as {
      stage?: EnterpriseTriageStage;
      userMessage?: string;
      conversationHistory?: Array<{ sender: 'user' | 'assistant'; text: string }>;
      platform?: 'windows' | 'macos' | 'ubuntu';
      snapshot?: TelemetrySnapshot | null;
      findings?: EvidenceFinding[];
      hypotheses?: TriageHypothesis[];
      providerConfig?: {
        provider?: ModelProvider;
        apiKey?: string;
        model?: string;
      };
    };

    if (!body.userMessage || typeof body.userMessage !== 'string') {
      return Response.json(
        { ok: false, error: 'userMessage string is required for triage.' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const triageRequest: DeductiveTriageRequest = {
      stage: body.stage || 'deductive_questioning',
      userMessage: body.userMessage,
      conversationHistory: body.conversationHistory || [],
      platform: body.platform || 'windows',
      snapshot: body.snapshot || null,
      findings: body.findings || [],
      hypotheses: body.hypotheses || [],
    };

    const provider = body.providerConfig?.provider || 'gemini';
    const apiKey =
      body.providerConfig?.apiKey?.trim() ||
      (provider === 'gemini'
        ? process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
        : process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY) ||
      '';

    const result = await executeDeductiveTriage(triageRequest, {
      provider,
      apiKey,
      model: body.providerConfig?.model || (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'),
      modelAllowlist: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gpt-4o', 'gpt-4o-mini'],
      enabled: true,
      timeoutMs: 15000,
    });

    return Response.json(
      { ok: true, data: result },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
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
