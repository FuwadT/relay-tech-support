import type {
  AIExplanation,
  AIExplanationProvider,
  Answers,
  CaseMeasurements,
  Category,
} from './contracts';
import { getChecks } from './diagnostics';

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
      if (typeof v === 'number' && Number.isFinite(v)) {
        tokens.push(`baseline_${k}:${v}`);
      }
    }
  }

  if (measurements?.followUp) {
    for (const [k, v] of Object.entries(measurements.followUp)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
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
 * Checks for malicious, dangerous, or unverified command instructions in text.
 * Rejects terminal commands, scripts, security-disabling advice, and arbitrary execution.
 */
export function isMaliciousText(text: string): boolean {
  if (typeof text !== 'string') return true;

  const dangerousPatterns = [
    /powershell/i,
    /remove-item/i,
    /rmdir/i,
    /del\s+[\/\\]/i,
    /format\s+[a-z]:/i,
    /cmd(\.exe)?/i,
    /invoke-expression/i,
    /\biex\b/i,
    /curl\s+/i,
    /wget\s+/i,
    /bash\s+/i,
    /chmod\s+/i,
    /sudo\s+/i,
    /\brm\s+-/i,
    /taskkill/i,
    /(?<!(do not|don't|never|avoid)\s+)(disable|turn\s*off).*(defender|firewall|antivirus)/i,
    /ignore.*(warning|security)/i,
    /unverified.*driver/i,
    /bypass.*security/i,
    /registry.*clean/i,
    /regedit/i,
    /reg\s+(add|delete)/i,
    /hkey_/i,
    /\.(exe|bat|ps1|vbs|sh)\b/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(text));
}

/**
 * Validates and normalizes raw model output against the strict AIExplanation schema.
 * Rejects hallucinated check IDs, malicious prose, and malformed schemas by failing closed
 * to deterministic fallback.
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

  // Strict schema validation: raw must be an object and not an array
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
  }

  const obj = raw as Record<string, unknown>;

  // 1. Validate summary: required non-empty string, min 10 chars, max 1000 chars, no malicious content
  if (
    typeof obj.summary !== 'string' ||
    obj.summary.trim().length < 10 ||
    obj.summary.length > 1000 ||
    isMaliciousText(obj.summary)
  ) {
    return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
  }
  const summary = obj.summary.trim();

  // 2. Validate likelyCauses: must be a non-empty array of strings (1-5), each non-empty, max 300 chars, no malicious content
  if (!Array.isArray(obj.likelyCauses) || obj.likelyCauses.length === 0 || obj.likelyCauses.length > 5) {
    return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
  }
  const likelyCauses: string[] = [];
  for (const cause of obj.likelyCauses) {
    if (
      typeof cause !== 'string' ||
      cause.trim().length === 0 ||
      cause.length > 300 ||
      isMaliciousText(cause)
    ) {
      return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
    }
    likelyCauses.push(cause.trim());
  }

  // 3. Validate recommendedCheckIds: must be a non-empty array of strings, all strictly within validCheckIds
  if (
    !Array.isArray(obj.recommendedCheckIds) ||
    obj.recommendedCheckIds.length === 0 ||
    obj.recommendedCheckIds.length > 5
  ) {
    return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
  }
  const recommendedCheckIds: string[] = [];
  for (const checkId of obj.recommendedCheckIds) {
    if (typeof checkId !== 'string' || !validCheckIds.includes(checkId)) {
      // Any unrecognized or unapproved check ID fails closed
      return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
    }
    if (!recommendedCheckIds.includes(checkId)) {
      recommendedCheckIds.push(checkId);
    }
  }

  // 4. Validate cautions: must be an array of strings, none malicious
  if (!Array.isArray(obj.cautions)) {
    return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
  }
  const cautions: string[] = [];
  for (const caution of obj.cautions) {
    if (typeof caution !== 'string' || isMaliciousText(caution)) {
      return generateDeterministicAIExplanation(category, evidenceUsed, latencyMs, 'deterministic-fallback');
    }
    if (caution.trim().length > 0) {
      cautions.push(caution.trim().slice(0, 300));
    }
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
 * Deterministic explanation generator grounded conservatively in reviewed diagnostics (v1.0.2).
 * Operates without external network calls, preserves honest uncertainty, and avoids ungrounded causal claims.
 */
export function generateDeterministicAIExplanation(
  category: Category,
  evidenceUsed: string[],
  latencyMs: number = 5,
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
      likelyCauses.push('Multiple devices are affected on this network; this points toward shared local Wi-Fi or broadband service provider status.');
      recommendedCheckIds.push('scope', 'connection');
    } else if (evidenceStr.includes('scope:one_device')) {
      likelyCauses.push('Only this computer is affected; this points to device network adapter settings or local wireless distance.');
      recommendedCheckIds.push('scope', 'connection');
    }

    if (evidenceStr.includes('connection:better_near')) {
      likelyCauses.push('Performance improves closer to the router, consistent with wireless path degradation or physical obstruction.');
      if (!recommendedCheckIds.includes('connection')) recommendedCheckIds.push('connection');
    }

    if (evidenceStr.includes('activity:better_paused')) {
      likelyCauses.push('Performance improves when network activity is paused, consistent with bandwidth utilization from concurrent background activity.');
      if (!recommendedCheckIds.includes('activity')) recommendedCheckIds.push('activity');
    }

    if (evidenceStr.includes('reach:one_service')) {
      likelyCauses.push('The symptom affects a single service; this suggests remote service status or DNS routing rather than a general local link problem.');
      if (!recommendedCheckIds.includes('reach')) recommendedCheckIds.push('reach');
    }

    if (likelyCauses.length === 0) {
      likelyCauses.push('Initial observations do not yet isolate a specific network cause. Complete the recommended checks to gather baseline data.');
      recommendedCheckIds.push('scope', 'connection');
    }

    summary = `Based on ${evidenceUsed.length} recorded observation(s), your network symptoms suggest ${likelyCauses[0].toLowerCase()}`;
    cautions.push('Avoid downloading third-party "internet accelerator" or driver updater software.');
    cautions.push('Do not modify router firewall settings or disable security features.');
  } else {
    // performance category
    if (evidenceStr.includes('scope:one_app')) {
      likelyCauses.push('Slowdown is isolated to a single application; check that application vendor updates and official recommendations.');
      recommendedCheckIds.push('scope', 'startup_apps');
    } else if (evidenceStr.includes('scope:whole_device')) {
      likelyCauses.push('Device-wide responsiveness symptom; verify active background workload and system drive capacity.');
      recommendedCheckIds.push('background_tasks', 'storage');
    }

    if (evidenceStr.includes('resources:cpu') || evidenceStr.includes('resources:memory')) {
      likelyCauses.push('Sustained high hardware utilization recorded during active tasks. Observe specific process demands in Task Manager.');
      if (!recommendedCheckIds.includes('background_tasks')) recommendedCheckIds.push('background_tasks');
    }

    if (evidenceStr.includes('storage:low')) {
      likelyCauses.push('Drive C: has limited available free space, which can restrict temporary cache and virtual memory allocation.');
      if (!recommendedCheckIds.includes('storage')) recommendedCheckIds.push('storage');
    }

    if (likelyCauses.length === 0) {
      likelyCauses.push('Initial observations do not isolate a specific performance bottleneck. Follow the diagnostic checks to isolate the symptom.');
      recommendedCheckIds.push('startup_apps', 'background_tasks');
    }

    summary = `Based on ${evidenceUsed.length} recorded observation(s), your system symptoms suggest ${likelyCauses[0].toLowerCase()}`;
    cautions.push('Do not download third-party registry cleaners or PC speed-up utilities.');
    cautions.push('Do not stop unfamiliar Windows system processes in Task Manager.');
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
 * Main AI Explanation Generation Entrypoint.
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
        const data = (await response.json()) as any;
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
