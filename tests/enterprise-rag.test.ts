/**
 * Unit & Integration Tests for Enterprise IT RAG System.
 * Verifies lexical BM25 token matching, evidence finding boosts,
 * platform safety filtering, and prompt context formatting.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  tokenize,
  retrieveRunbooks,
  buildRagPromptContext,
  ENTERPRISE_RUNBOOKS,
} from '../lib/enterprise/rag';
import type { EvidenceFinding } from '../lib/enterprise/contracts';

describe('Enterprise RAG: Tokenization & Index Structure', () => {
  it('tokenizes queries into clean lowercase alphanumeric tokens', () => {
    const tokens = tokenize('High Memory & CPU Usage (90%!!) in Chrome!');
    assert.deepStrictEqual(tokens, ['high', 'memory', 'cpu', 'usage', 'chrome']);
  });

  it('verifies all runbooks adhere to strict non-elevated safety guarantees', () => {
    for (const rb of ENTERPRISE_RUNBOOKS) {
      assert.ok(rb.id.startsWith('rb-'));
      assert.ok(rb.title.length > 5);
      assert.ok(rb.keywords.length >= 3);
      assert.ok(rb.diagnosticChecks.length >= 2);
      assert.ok(rb.commonPitfalls.length >= 1);

      // Verify no runbook remediation recommends elevation
      for (const rem of rb.safeRemediations) {
        assert.doesNotMatch(rem.commandOrSteps, /sudo\s/i);
        assert.doesNotMatch(rem.commandOrSteps, /kill\s+-9/i);
        assert.doesNotMatch(rem.commandOrSteps, /Stop-Process\s+-Force/i);
        assert.doesNotMatch(rem.commandOrSteps, /Set-ItemProperty/i);
        assert.doesNotMatch(rem.commandOrSteps, /runas/i);
      }
    }
  });
});

describe('Enterprise RAG: Retrieval Accuracy by Symptom & Finding', () => {
  it('retrieves Memory Pressure runbook for RAM/sluggish queries', () => {
    const results = retrieveRunbooks('my ram is constantly full and computer is sluggish', {
      platform: 'windows',
    });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].runbook.id, 'rb-memory-pressure');
    assert.ok(results[0].score >= 6);
  });

  it('boosts DNS runbook when dns-unsuccessful finding is present', () => {
    const findings: EvidenceFinding[] = [
      {
        id: 'dns-unsuccessful',
        severity: 'warning',
        observation: 'DNS failed',
        hypothesis: null,
        evidenceIds: ['/dnsResolved'],
        recommendedCheckIds: [],
        ruleVersion: '1.0.0',
      },
    ];
    const results = retrieveRunbooks('webpage cannot be reached', {
      platform: 'windows',
      findings,
    });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].runbook.id, 'rb-network-dns');
    assert.ok(results[0].matchedFindings.includes('dns-unsuccessful'));
    assert.ok(results[0].score >= 10);
  });

  it('retrieves Disk Exhaustion runbook when disk-free-low finding is present', () => {
    const findings: EvidenceFinding[] = [
      {
        id: 'disk-free-low',
        severity: 'warning',
        observation: 'Disk free low',
        hypothesis: null,
        evidenceIds: ['/diskFreeGb'],
        recommendedCheckIds: [],
        ruleVersion: '1.0.0',
      },
    ];
    const results = retrieveRunbooks('computer is running out of space', {
      platform: 'windows',
      findings,
    });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].runbook.id, 'rb-disk-exhaustion');
    assert.ok(results[0].matchedFindings.includes('disk-free-low'));
  });

  it('retrieves CPU Contention runbook for fan noise and heat symptoms', () => {
    const results = retrieveRunbooks('fans are spinning loud and laptop is getting hot', {
      platform: 'windows',
    });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].runbook.id, 'rb-cpu-contention');
  });

  it('retrieves Browser Web Apps runbook for 403 Forbidden / cookie errors', () => {
    const results = retrieveRunbooks('getting 403 forbidden on the payroll portal with stale cookies', {
      platform: 'windows',
    });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].runbook.id, 'rb-browser-webapps');
  });

  it('retrieves Terminal Script Recovery runbook when process not found is reported', () => {
    const results = retrieveRunbooks('Process not found or belongs to another session; skipped.', {
      platform: 'windows',
    });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].runbook.id, 'rb-terminal-recovery');
  });
});

describe('Enterprise RAG: Prompt Context Formatting', () => {
  it('formats retrieved runbooks into an LLM system prompt context block', () => {
    const results = retrieveRunbooks('sluggish memory pressure', { platform: 'windows' });
    const promptContext = buildRagPromptContext(results, 'windows');

    assert.ok(promptContext.includes('=== RETRIEVED ENTERPRISE IT RUNBOOK CONTEXT ==='));
    assert.ok(promptContext.includes('IT RUNBOOK: High Memory Utilization & Working Set Diagnostics'));
    assert.ok(promptContext.includes('Get-Process | Sort-Object WorkingSet64 -Descending'));
    assert.ok(promptContext.includes('CAUTION: Targeting PID 0 or PID 4: Windows PID 0 is the System Idle Process'));
    assert.doesNotMatch(promptContext, /sudo\s/);
  });

  it('returns empty string when no runbooks meet threshold', () => {
    const emptyContext = buildRagPromptContext([]);
    assert.strictEqual(emptyContext, '');
  });
});
