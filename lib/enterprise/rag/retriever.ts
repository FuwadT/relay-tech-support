/**
 * Edge-Compatible RAG Retrieval Engine for Enterprise IT Support.
 *
 * Implements token-based BM25-style lexical scoring combined with
 * telemetry evidence finding matching to retrieve relevant IT Runbooks
 * without external vector database dependencies.
 *
 * Runs efficiently across Cloudflare Workers, Node.js runtimes, and browsers.
 */

import type { DevicePlatform, EvidenceFinding } from '../contracts';
import { ENTERPRISE_RUNBOOKS, type ITRunbook } from './runbooks';

export interface RAGRetrievalOptions {
  platform?: DevicePlatform;
  findingIds?: string[];
  findings?: EvidenceFinding[];
  category?: string;
  maxResults?: number;
  minScoreThreshold?: number;
}

export interface ScoredRunbook {
  runbook: ITRunbook;
  score: number;
  matchedKeywords: string[];
  matchedFindings: string[];
}

/**
 * Tokenizes text into lowercase normalized alphanumeric tokens.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const _customRunbooks: ITRunbook[] = [];

/**
 * Registers a custom runbook/SOP dynamically at runtime.
 */
export function registerCustomRunbook(runbook: ITRunbook): void {
  const idx = _customRunbooks.findIndex((rb) => rb.id === runbook.id);
  const entry: ITRunbook = {
    ...runbook,
    isCustom: true,
  };
  if (idx >= 0) {
    _customRunbooks[idx] = entry;
  } else {
    _customRunbooks.push(entry);
  }
}

/**
 * Lists all registered and built-in runbooks, optionally filtered by tenantId.
 */
export function listRunbooks(tenantId?: string): ITRunbook[] {
  const all = [..._customRunbooks, ...ENTERPRISE_RUNBOOKS];
  if (!tenantId) return all;
  return all.filter((rb) => !rb.tenantId || rb.tenantId === tenantId);
}

/**
 * Symptom domain keywords mapped to runbook categories for hybrid boosting.
 */
const SYMPTOM_DOMAINS: Record<string, string[]> = {
  memory: ['ram', 'memory', 'sluggish', 'paging', 'leak', 'working set', 'freeze'],
  cpu_thermal: ['cpu', 'fan', 'heat', 'hot', 'thermal', 'noise', 'throttling', 'spin'],
  network_dns: ['dns', 'domain', 'network', 'wifi', 'reach', 'resolve', 'ping', 'latency', 'portal'],
  disk_io: ['disk', 'storage', 'space', 'full', 'io', 'clean', 'temp'],
  application: ['crash', 'exit', 'error', '403', 'forbidden', 'stale', 'cookie', 'session'],
  general: ['slow', 'troubleshoot', 'hang', 'glitch'],
};

/**
 * Retrieves the most relevant IT runbooks for a user query and telemetry state
 * using BM25-weighted lexical term saturation, title/tag weighting, and symptom domain boosting.
 */
export function retrieveRunbooks(
  query: string,
  options: RAGRetrievalOptions = {},
): ScoredRunbook[] {
  const {
    platform,
    findingIds = [],
    findings = [],
    category,
    maxResults = 2,
    minScoreThreshold = 3,
  } = options;

  const allFindingIds = new Set<string>([
    ...findingIds,
    ...findings.map((f) => f.id),
  ]);

  const queryTokens = tokenize(query);
  const queryTokenSet = new Set(queryTokens);
  const queryLower = query.toLowerCase();

  const scored: ScoredRunbook[] = [];
  const candidateRunbooks = listRunbooks();

  for (const rb of candidateRunbooks) {
    // Platform compatibility filter
    if (platform && !rb.platforms.includes(platform)) {
      continue;
    }

    let score = 0;
    const matchedKeywords: string[] = [];
    const matchedFindings: string[] = [];

    // 1. Evidence Finding matching (highest weight: +10 per match)
    for (const findingId of allFindingIds) {
      if (rb.findings.includes(findingId)) {
        score += 10;
        matchedFindings.push(findingId);
      }
    }

    // 2. Category matching (+5)
    if (category && rb.category === category) {
      score += 5;
    }

    // 3. Custom tenant SOP priority boost (+2)
    if (rb.isCustom) {
      score += 2;
    }

    // 4. BM25-style weighted term frequency scoring
    // Count token occurrences across title (3.0x), keywords (2.5x), and summary/checks (1.0x)
    const titleText = rb.title.toLowerCase();
    const keywordsText = rb.keywords.join(' ').toLowerCase();
    const bodyText = `${rb.summary} ${rb.diagnosticChecks.join(' ')}`.toLowerCase();

    for (const token of queryTokenSet) {
      let tf = 0;
      if (titleText.includes(token)) tf += 3.0;
      if (keywordsText.includes(token)) tf += 2.5;
      if (bodyText.includes(token)) tf += 1.0;

      if (tf > 0) {
        // BM25 term saturation with k1 = 1.2
        score += (tf * 2.2) / (tf + 1.2);
      }
    }

    // 5. Keyword exact/phrase matching (+3 per matched keyword)
    for (const kw of rb.keywords) {
      const kwTokens = tokenize(kw);
      const isMatch = kwTokens.some((t) => queryTokenSet.has(t));
      if (isMatch || queryLower.includes(kw.toLowerCase())) {
        score += 3;
        if (!matchedKeywords.includes(kw)) {
          matchedKeywords.push(kw);
        }
      }
    }

    // 6. Title token overlap (+2 per match)
    const titleTokens = tokenize(rb.title);
    for (const t of titleTokens) {
      if (queryTokenSet.has(t)) {
        score += 2;
      }
    }

    // 7. Symptom domain boosting (+3 if query shares symptom domain indicators)
    const domainIndicators = SYMPTOM_DOMAINS[rb.category] || [];
    if (domainIndicators.some((ind) => queryLower.includes(ind))) {
      score += 3;
    }

    if (score >= minScoreThreshold) {
      scored.push({
        runbook: rb,
        score: Math.round(score * 10) / 10,
        matchedKeywords,
        matchedFindings,
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults);
}

/** Alias conforming to the Phase 4 specification */
export const retrieveRelevantRunbooks = retrieveRunbooks;

/**
 * Builds an IT Knowledge Base context snippet suitable for LLM system prompt injection.
 */
export function buildRagPromptContext(
  scoredRunbooks: ScoredRunbook[],
  platform: DevicePlatform = 'windows',
): string {
  if (scoredRunbooks.length === 0) {
    return '';
  }

  const sections = scoredRunbooks.map(({ runbook }) => {
    const relevantRemediations = runbook.safeRemediations
      .filter((r) => r.platform === platform || r.platform === 'windows')
      .map((r) => `  - [${r.title}]: ${r.commandOrSteps}`)
      .join('\n');

    return `### IT RUNBOOK: ${runbook.title} (Domain: ${runbook.category})
Summary: ${runbook.summary}
Diagnostic Checks:
${runbook.diagnosticChecks.map((c) => `  - ${c}`).join('\n')}
Safe Non-Elevated Steps:
${relevantRemediations || '  - Direct user settings review.'}
Operational Pitfalls:
${runbook.commonPitfalls.map((p) => `  - CAUTION: ${p}`).join('\n')}`;
  });

  return `\n\n=== RETRIEVED ENTERPRISE IT RUNBOOK CONTEXT ===\n${sections.join('\n\n')}\n===============================================\n`;
}
