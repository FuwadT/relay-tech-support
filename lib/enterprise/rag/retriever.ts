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

/**
 * Retrieves the most relevant IT runbooks for a user query and telemetry state.
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

  const queryTokens = new Set(tokenize(query));

  const scored: ScoredRunbook[] = [];

  for (const rb of ENTERPRISE_RUNBOOKS) {
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

    // 3. Keyword matching (+3 per matched keyword/token)
    for (const kw of rb.keywords) {
      const kwTokens = tokenize(kw);
      const isMatch = kwTokens.some((t) => queryTokens.has(t));
      if (isMatch || query.toLowerCase().includes(kw)) {
        score += 3;
        if (!matchedKeywords.includes(kw)) {
          matchedKeywords.push(kw);
        }
      }
    }

    // 4. Title token overlap (+2 per match)
    const titleTokens = tokenize(rb.title);
    for (const t of titleTokens) {
      if (queryTokens.has(t)) {
        score += 2;
      }
    }

    if (score >= minScoreThreshold) {
      scored.push({
        runbook: rb,
        score,
        matchedKeywords,
        matchedFindings,
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults);
}

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
