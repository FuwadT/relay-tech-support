import type {
  AIExplanation,
  AIExplanationProvider,
  Answers,
  CaseMeasurements,
  Category,
} from './contracts';
import { getChecks, getMeasurementDefinitions } from './diagnostics';

export interface GenerateAIExplanationOptions {
  caseId: string;
  category: Category;
  title: string;
  description: string;
  answers: Answers;
  measurements?: CaseMeasurements;
  timeoutMs?: number;
}

/**
 * Extracts normalized evidence tokens from case answers and measurements.
 */
export function extractEvidenceTokens(
  answers: Answers,
  measurements?: CaseMeasurements
): string[] {
  const tokens: string[] = [];

  for (const [k, v] of Object.entries(answers)) {
    if (v && !['unknown', 'not_tried'].includes(v)) {
      tokens.push(`${k}:${v}`);
    }
  }

  if (measurements?.baseline) {
    for (const [k, v] of Object.entries(measurements.baseline)) {
      if (typeof v === 'number') {
        tokens.push(`baseline_${k}:${v}`);
      }
    }
  }

  if (measurements?.followUp) {
    for (const [k, v] of Object.entries(measurements.followUp)) {
      if (typeof v === 'number') {
        tokens.push(`followup_${k}:${v}`);
      }
    }
  }

  return tokens;
}

/**
 * Sanitizes untrusted user strings to protect prompt boundaries from instruction injection.
 */
function sanitizeForPrompt(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .slice(0, 1000)
    .trim();
}

/**
 * Validates and normalizes raw model output against the strict AIExplanation schema.
 * Rejects hallucinated check IDs and bounds string lengths.
 */
export function validateAndNormalizeAIResponse(
  raw: unknown,
  category: Category,
  evidenceUsed: string[],
  provider: AIExplanationProvider,
  latencyMs: number
): AIExplanation {
  const validCheckIds = getChecks(category).map((c) => c.id);
  const now = new Date().toISOString();

  if (!raw || typeof raw !== 'object') {
    return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
  }

  const obj = raw as Record<string, unknown>;

  // Validate Summary
  let summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) {
    summary = category === 'network'
      ? 'Diagnostic evaluation of observed network performance and connectivity symptoms.'
      : 'Diagnostic evaluation of observed system performance and responsiveness symptoms.';
  }
  summary = summary.slice(0, 1000);

  // Validate Likely Causes (1-3 strings)
  let likelyCauses: string[] = [];
  if (Array.isArray(obj.likelyCauses)) {
    likelyCauses = obj.likelyCauses
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim().slice(0, 300))
      .slice(0, 3);
  }
  if (likelyCauses.length === 0) {
    likelyCauses = [
      category === 'network'
        ? 'Possible network equipment congestion or wireless signal constraint.'
        : 'Possible active application resource contention or background load.',
    ];
  }

  // Validate Recommended Check IDs (Must strictly match approved checks)
  let recommendedCheckIds: string[] = [];
  if (Array.isArray(obj.recommendedCheckIds)) {
    recommendedCheckIds = obj.recommendedCheckIds
      .filter((id): id is string => typeof id === 'string' && validCheckIds.includes(id))
      .slice(0, 3);
  }
  if (recommendedCheckIds.length === 0) {
    recommendedCheckIds = validCheckIds.slice(0, 2);
  }

  // Validate Cautions (1-3 strings)
  let cautions: string[] = [];
  if (Array.isArray(obj.cautions)) {
    cautions = obj.cautions
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim().slice(0, 300))
      .slice(0, 3);
  }
  if (cautions.length === 0) {
    cautions = [
      'Do not download unverified optimizer software or disable system firewalls.',
    ];
  }

  return {
    summary,
    likelyCauses,
    recommendedCheckIds,
    cautions,
    evidenceUsed,
    provider,
    latencyMs: Math.round(latencyMs),
    generatedAt: now,
  };
}

/**
 * Generates deterministic, evidence-grounded technical explanations when no live provider
 * is configured or when a live provider fails/times out.
 */
export function generateDeterministicAIExplanation(
  category: Category,
  evidenceUsed: string[],
  latencyMs = 5,
  provider: AIExplanationProvider = 'deterministic-fallback'
): AIExplanation {
  const validCheckIds = getChecks(category).map((c) => c.id);
  const now = new Date().toISOString();

  const evidenceStr = evidenceUsed.join(' ');
  const likelyCauses: string[] = [];
  const recommendedCheckIds: string[] = [];
  const cautions: string[] = [];
  let summary = '';

  if (category === 'network') {
    if (evidenceStr.includes('scope:all_devices')) {
      likelyCauses.push('Shared local gateway, access point congestion, or broadband service provider constraint.');
      recommendedCheckIds.push('reach', 'connection');
    } else if (evidenceStr.includes('scope:one_device')) {
      likelyCauses.push('Device-specific network adapter configuration or localized wireless path degradation.');
      recommendedCheckIds.push('connection', 'activity');
    }

    if (evidenceStr.includes('connection:better_near')) {
      likelyCauses.push('Wi-Fi attenuation, physical obstruction, or 2.4GHz/5GHz band interference.');
      if (!recommendedCheckIds.includes('connection')) recommendedCheckIds.push('connection');
    }

    if (evidenceStr.includes('activity:better_paused')) {
      likelyCauses.push('Bandwidth saturation from concurrent streams, cloud backups, or background downloads.');
      if (!recommendedCheckIds.includes('activity')) recommendedCheckIds.push('activity');
    }

    if (evidenceStr.includes('reach:one_service')) {
      likelyCauses.push('Target service outage, DNS resolution limitation, or remote endpoint degradation.');
      if (!recommendedCheckIds.includes('reach')) recommendedCheckIds.push('reach');
    }

    if (likelyCauses.length === 0) {
      likelyCauses.push('Incomplete observation data: baseline Wi-Fi or adapter throughput requires investigation.');
      recommendedCheckIds.push('scope', 'connection');
    }

    summary = `Based on ${evidenceUsed.length} recorded observation(s), your network symptoms point primarily to ${likelyCauses[0].toLowerCase()}`;
    cautions.push('Do not disable your Windows Defender Firewall or modify router DNS to untrusted third parties.');
    cautions.push('Avoid commercial "internet accelerator" utilities that install virtual network drivers.');
  } else {
    // performance category
    if (evidenceStr.includes('scope:one_app')) {
      likelyCauses.push('Application-specific execution hang, memory leak, or incompatibility with current update.');
      recommendedCheckIds.push('resources', 'restart');
    } else if (evidenceStr.includes('scope:whole_device')) {
      likelyCauses.push('System-wide resource saturation, drive indexing pressure, or background OS maintenance.');
      recommendedCheckIds.push('resources', 'storage');
    }

    if (evidenceStr.includes('resources:cpu')) {
      likelyCauses.push('Sustained high processor demand from an active foreground process or background thread.');
      if (!recommendedCheckIds.includes('resources')) recommendedCheckIds.push('resources');
    } else if (evidenceStr.includes('resources:memory')) {
      likelyCauses.push('Memory commitment reaching hardware capacity, triggering virtual memory paging to disk.');
      if (!recommendedCheckIds.includes('resources')) recommendedCheckIds.push('resources');
    } else if (evidenceStr.includes('resources:disk')) {
      likelyCauses.push('Intensive storage read/write queueing or disk controller activity bottleneck.');
      if (!recommendedCheckIds.includes('resources')) recommendedCheckIds.push('resources');
    }

    if (evidenceStr.includes('storage:low')) {
      likelyCauses.push('Crucial system partition (Drive C:) is low on free space, impairing swap and temp storage.');
      if (!recommendedCheckIds.includes('storage')) recommendedCheckIds.push('storage');
    }

    if (likelyCauses.length === 0) {
      likelyCauses.push('General responsiveness symptom; additional baseline measurements are needed to isolate cause.');
      recommendedCheckIds.push('scope', 'resources');
    }

    summary = `Based on ${evidenceUsed.length} recorded observation(s), your system slowdown points to ${likelyCauses[0].toLowerCase()}`;
    cautions.push('Do not run unauthorized registry cleaners or aggressive optimizer tools that modify Windows system files.');
    cautions.push('Do not terminate unfamiliar system processes in Task Manager.');
  }

  // Ensure recommended check IDs are valid
  const cleanChecks = recommendedCheckIds.filter((id) => validCheckIds.includes(id));
  if (cleanChecks.length === 0) {
    cleanChecks.push(...validCheckIds.slice(0, 2));
  }

  return {
    summary,
    likelyCauses: likelyCauses.slice(0, 3),
    recommendedCheckIds: cleanChecks.slice(0, 3),
    cautions: cautions.slice(0, 2),
    evidenceUsed,
    provider,
    latencyMs: Math.round(latencyMs),
    generatedAt: now,
  };
}

/**
 * Main AI Explanation Generation Entrypoint (S5-02, S5-03, S5-04).
 * Coordinates provider calls, prompt construction, injection defenses, and fallback.
 */
export async function generateCaseAIExplanation(
  options: GenerateAIExplanationOptions
): Promise<AIExplanation> {
  const startTime = performance.now();
  const evidenceUsed = extractEvidenceTokens(options.answers, options.measurements);
  const validCheckIds = getChecks(options.category).map((c) => c.id);
  const timeoutMs = options.timeoutMs ?? 8000;

  // Check for available server-side provider credentials
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: `You are an AI diagnostic assistant for Relay Tech Support on Windows 11.
Evaluate technical symptoms and measurements conservatively.
SECURITY RULES:
1. NEVER propose executable scripts (PowerShell, CMD, bash, vbs), terminal commands, or registry edits.
2. NEVER suggest third-party driver updaters or registry cleaners.
3. In "recommendedCheckIds", you may ONLY return IDs from this approved list: ${validCheckIds.join(', ')}.
4. Respond ONLY with valid JSON matching:
{
  "summary": "1-3 sentences plain-English explanation",
  "likelyCauses": ["1-3 likely technical root causes grounded strictly in the evidence"],
  "recommendedCheckIds": ["subset of approved check IDs to focus on"],
  "cautions": ["1-3 safety cautions against unsafe remedies"]
}`,
            },
            {
              role: 'user',
              content: `Problem Category: ${options.category}
OS: Windows 11 (personal device)
User Case Title: ${sanitizeForPrompt(options.title)}
User Problem Description: ${sanitizeForPrompt(options.description)}
Observed Evidence Tokens: ${evidenceUsed.join(', ') || 'None recorded yet'}
Approved Check IDs: ${validCheckIds.join(', ')}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          const latencyMs = performance.now() - startTime;
          return validateAndNormalizeAIResponse(parsed, options.category, evidenceUsed, 'openai', latencyMs);
        }
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Fallback: fast, deterministic, evidence-grounded generator
  const latencyMs = performance.now() - startTime;
  return generateDeterministicAIExplanation(options.category, evidenceUsed, latencyMs, 'deterministic-fallback');
}
