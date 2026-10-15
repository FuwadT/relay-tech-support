/**
 * In-memory rate limiting and usage controls for Case AI explanations (S5-05).
 * Enforces per-case limits, cooldown windows, and budget protections.
 */

const MAX_REQUESTS_PER_CASE = 5;
const COOLDOWN_MS = 3000; // 3 seconds between requests

interface CaseUsageRecord {
  count: number;
  lastRequestAt: number;
}

const usageMap = new Map<string, CaseUsageRecord>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: string;
  cooldownRemainingMs?: number;
}

export function checkAndRecordCaseAIUsage(caseId: string): RateLimitResult {
  const now = Date.now();
  const record = usageMap.get(caseId) ?? { count: 0, lastRequestAt: 0 };

  // Check cooldown
  const elapsed = now - record.lastRequestAt;
  if (record.count > 0 && elapsed < COOLDOWN_MS) {
    const cooldownRemaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return {
      allowed: false,
      remaining: Math.max(0, MAX_REQUESTS_PER_CASE - record.count),
      cooldownRemainingMs: COOLDOWN_MS - elapsed,
      error: `Please wait ${cooldownRemaining}s before requesting another AI explanation.`,
    };
  }

  // Check per-case cap
  if (record.count >= MAX_REQUESTS_PER_CASE) {
    return {
      allowed: false,
      remaining: 0,
      error: `Maximum AI explanations (${MAX_REQUESTS_PER_CASE}) reached for this case. Use guided recommendations.`,
    };
  }

  // Record usage
  record.count += 1;
  record.lastRequestAt = now;
  usageMap.set(caseId, record);

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_CASE - record.count,
  };
}

export function getCaseAIRemaining(caseId: string): number {
  const record = usageMap.get(caseId);
  if (!record) return MAX_REQUESTS_PER_CASE;
  return Math.max(0, MAX_REQUESTS_PER_CASE - record.count);
}

export function resetAIUsageForTesting(): void {
  usageMap.clear();
}
