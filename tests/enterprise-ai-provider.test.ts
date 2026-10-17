/**
 * Tests for Enterprise AI Provider Adapter (Task E6-01).
 * Verifies model allowlists, structured output safety, prohibition of executable code,
 * deterministic fallback, and cross-provider isolation.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EvidenceFinding, TelemetrySnapshot } from '../lib/enterprise/contracts';
import {
  buildDeductiveTriage,
  buildDeterministicFallback,
  buildGeminiContents,
  executeAIAnalysis,
  executeDeductiveTriage,
  validateDeductiveTriageResponse,
  validateStructuredAIOutput,
  type AIAnalysisRequest,
  type AIProviderConfig,
} from '../lib/enterprise/ai-provider-adapter';

const mockSnapshot: TelemetrySnapshot = {
  schemaVersion: 1,
  collectionId: 'c1111111-2222-4333-8444-555555555555',
  platform: 'windows',
  osVersion: 'Windows 11',
  architecture: 'x64',
  source: 'collector',
  collectorVersion: '1.0.0',
  collectedAt: new Date().toISOString(),
  sampleIntervalMs: 5000,
  cpuPercent: 92.0,
  memoryTotalMb: 16384,
  memoryUsedMb: 8000,
  diskTotalGb: 512,
  diskFreeGb: 200,
  dnsResolved: true,
  gatewayLatencyMs: 15,
  processes: [{ pid: 101, name: 'SearchIndexer.exe', cpuPercent: 88, memoryMb: 400 }],
  eventExcerpts: [],
  errors: [],
};

const mockFindings: EvidenceFinding[] = [
  {
    id: 'cpu-high',
    severity: 'warning',
    observation: 'CPU is recorded as 92.0%.',
    hypothesis: 'Possible resource contention.',
    evidenceIds: ['/cpuPercent'],
    recommendedCheckIds: [],
    ruleVersion: '1.0.0',
  },
];

const mockRequest: AIAnalysisRequest = {
  platform: 'windows',
  caseTitle: 'High CPU utilization',
  caseDescription: 'Fans running at maximum speed',
  snapshot: mockSnapshot,
  findings: mockFindings,
};

describe('E6-01: Structured AI Output Safety Boundary', () => {
  it('accepts valid structured output with approved catalog action and check IDs', () => {
    const validOutput = {
      technicalSummary: 'Telemetry shows high CPU utilization isolated to user-level process.',
      selectedCatalogActionId: 'win-proc-graceful-request',
      recommendedCheckIds: ['cpu_usage_check'],
    };

    const result = validateStructuredAIOutput(validOutput, 'windows');
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.selectedCatalogActionId, 'win-proc-graceful-request');
      assert.deepStrictEqual(result.value.recommendedCheckIds, ['cpu_usage_check']);
    }
  });

  it('rejects output containing executable code blocks or hazardous shell commands', () => {
    const hostileOutputs = [
      {
        technicalSummary: 'Here is the fix:\n```bash\nsudo rm -rf /var/cache\n```',
        selectedCatalogActionId: null,
        recommendedCheckIds: [],
      },
      {
        technicalSummary: 'Run this: kill -9 1234',
        selectedCatalogActionId: null,
        recommendedCheckIds: [],
      },
      {
        technicalSummary: '<script>alert("pwned")</script>',
        selectedCatalogActionId: null,
        recommendedCheckIds: [],
      },
      {
        technicalSummary: 'Edit registry with Set-ItemProperty HKLM:\\...',
        selectedCatalogActionId: null,
        recommendedCheckIds: [],
      },
    ];

    for (const hostile of hostileOutputs) {
      const result = validateStructuredAIOutput(hostile, 'windows');
      assert.strictEqual(
        result.ok,
        false,
        `Must reject output with hostile content: ${hostile.technicalSummary}`,
      );
      if (!result.ok) {
        assert.ok(result.error.includes('Security violation'));
      }
    }
  });

  it('rejects unapproved or platform-mismatched catalogActionId', () => {
    const mismatchedOutput = {
      technicalSummary: 'Flush the mDNS cache.',
      // mac action on windows platform
      selectedCatalogActionId: 'mac-net-flush-dns',
      recommendedCheckIds: [],
    };

    const result = validateStructuredAIOutput(mismatchedOutput, 'windows');
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('not in the approved catalog for platform "windows"'));
    }
  });

  it('filters out non-allowlisted diagnostic check IDs', () => {
    const outputWithBogusChecks = {
      technicalSummary: 'Diagnostic check recommendation.',
      selectedCatalogActionId: null,
      recommendedCheckIds: ['cpu_usage_check', 'arbitrary_shell_injection_check', 'net_adapter_power_save'],
    };

    const result = validateStructuredAIOutput(outputWithBogusChecks, 'windows');
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.value.recommendedCheckIds, ['cpu_usage_check', 'net_adapter_power_save']);
      assert.ok(!result.value.recommendedCheckIds.includes('arbitrary_shell_injection_check'));
    }
  });
});

describe('E6-01: Provider Controls, Allowlists, and Deterministic Fallback', () => {
  it('falls back deterministically when AI is disabled by organization admin', async () => {
    const config: AIProviderConfig = {
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key',
      model: 'claude-3-5-sonnet',
      modelAllowlist: ['claude-3-5-sonnet'],
      enabled: false, // Disabled!
    };

    const result = await executeAIAnalysis(config, mockRequest);
    assert.strictEqual(result.isFallback, true);
    assert.strictEqual(result.provider, 'anthropic');
    assert.ok(result.fallbackReason?.includes('disabled'));
    assert.strictEqual(result.output.selectedCatalogActionId, 'win-proc-graceful-request');
  });

  it('falls back deterministically when requested model is not in the allowlist', async () => {
    const config: AIProviderConfig = {
      provider: 'openai',
      apiKey: 'sk-proj-test-key',
      model: 'gpt-4o-unapproved-model',
      modelAllowlist: ['gpt-4o-mini'], // gpt-4o-unapproved-model is not allowlisted!
      enabled: true,
    };

    const result = await executeAIAnalysis(config, mockRequest);
    assert.strictEqual(result.isFallback, true);
    assert.ok(result.fallbackReason?.includes('not in the approved allowlist'));
  });

  it('preserves provider isolation: fallback never routes to another provider', () => {
    const geminiFallback = buildDeterministicFallback(mockRequest, 'Quota exceeded', 'gemini');
    assert.strictEqual(geminiFallback.provider, 'gemini');

    const anthropicFallback = buildDeterministicFallback(mockRequest, 'Timeout', 'anthropic');
    assert.strictEqual(anthropicFallback.provider, 'anthropic');
  });
});

describe('Phase 2: Multi-Turn Deductive Triage & Hypothesis Pruning', () => {
  it('intake_discovery returns greeting, clarifying quickReplies, and active domain hypotheses', () => {
    const res = buildDeductiveTriage({
      stage: 'intake_discovery',
      userMessage: '',
      platform: 'windows',
    });

    assert.strictEqual(res.stage, 'deductive_questioning');
    assert.ok(res.reply.includes('What seems to be the issue'));
    assert.ok(res.quickReplies.length >= 3);
    assert.ok(res.hypotheses.length >= 3);
    assert.strictEqual(res.recommendedAction, 'ask_clarifying_question');
    assert.strictEqual(res.addressedSymptomMismatch, false);
  });

  it('deductive_questioning formulates targeted hypotheses and asks exactly one clarifying question', () => {
    const res = buildDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'The fan noise is very loud and my computer freezes',
      platform: 'windows',
    });

    assert.strictEqual(res.stage, 'deductive_questioning');
    assert.ok(res.reply.includes('fan noise and system freezes'));
    const cpuHyp = res.hypotheses.find((h) => h.domain === 'cpu_thermal');
    const netHyp = res.hypotheses.find((h) => h.domain === 'network_dns');
    assert.ok(cpuHyp && cpuHyp.status === 'active' && cpuHyp.confidence >= 0.6);
    assert.ok(netHyp && netHyp.status === 'ruled_out');
    assert.strictEqual(res.recommendedAction, 'ask_clarifying_question');
  });

  it('active_investigation answers follow-up directly from existing snapshot without resetting authorization', () => {
    const res = buildDeductiveTriage({
      stage: 'active_investigation',
      userMessage: 'Is my CPU running too hot or at high usage?',
      platform: 'windows',
      snapshot: mockSnapshot,
    });

    assert.strictEqual(res.stage, 'active_investigation');
    assert.ok(res.reply.includes('92%'));
    assert.ok(res.reply.includes('SearchIndexer.exe'));
    const cpuHyp = res.hypotheses.find((h) => h.domain === 'cpu_thermal');
    assert.ok(cpuHyp && cpuHyp.status === 'confirmed');
    assert.strictEqual(res.addressedSymptomMismatch, false);
  });

  it('active_investigation detects symptom-vs-telemetry mismatch and explains secondary bottleneck', () => {
    const mismatchSnapshot: TelemetrySnapshot = {
      ...mockSnapshot,
      cpuPercent: null,
      dnsResolved: false,
    };

    const res = buildDeductiveTriage({
      stage: 'active_investigation',
      userMessage: 'My fans are spinning loud, is CPU usage high?',
      platform: 'windows',
      snapshot: mismatchSnapshot,
    });

    assert.strictEqual(res.stage, 'active_investigation');
    assert.strictEqual(res.addressedSymptomMismatch, true);
    assert.ok(res.reply.includes('does not indicate continuous thermal overload'));
    assert.ok(res.reply.includes('DNS hostname resolution is failing'));
    const netHyp = res.hypotheses.find((h) => h.domain === 'network_dns');
    const cpuHyp = res.hypotheses.find((h) => h.domain === 'cpu_thermal');
    assert.ok(netHyp && netHyp.status === 'confirmed');
    assert.ok(cpuHyp && cpuHyp.status === 'ruled_out');
  });

  it('validates DeductiveTriageResponse structure with validateDeductiveTriageResponse', () => {
    const valid = {
      stage: 'deductive_questioning',
      reply: 'Clarifying question',
      quickReplies: ['A', 'B'],
      hypotheses: [{ id: '1', domain: 'cpu_thermal', summary: 'test', confidence: 0.8, status: 'active' }],
      recommendedAction: 'ask_clarifying_question',
    };
    const result = validateDeductiveTriageResponse(valid);
    assert.strictEqual(result.ok, true);

    const invalid = { reply: '' };
    assert.strictEqual(validateDeductiveTriageResponse(invalid).ok, false);
  });

  it('executeDeductiveTriage isolates web portal and cache issues without mentioning fan noise', async () => {
    const res = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'A web portal is failing to load properly; I need help clearing localized browser cache and permissions.',
      platform: 'windows',
    });

    assert.strictEqual(res.stage, 'deductive_questioning');
    assert.ok(res.reply.toLowerCase().includes('portal'));
    assert.ok(!res.reply.toLowerCase().includes('fan noise'));
    assert.ok(res.isFallback, 'Must indicate offline fallback when no API key configured');
    const permHyp = res.hypotheses.find((h) => h.domain === 'permissions');
    assert.ok(permHyp && permHyp.status === 'active');
  });

  it('executeDeductiveTriage isolates general slowness without ungrounded fan noise assumptions', async () => {
    const res = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'my computer is slow',
      platform: 'windows',
    });

    assert.strictEqual(res.stage, 'deductive_questioning');
    assert.ok(!res.reply.toLowerCase().includes('fan noise'));
    assert.ok(res.quickReplies.length >= 3);
  });

  it('executeDeductiveTriage prevents infinite loop when user answers scope and timing questions', async () => {
    // Turn 1
    const t1 = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'my computer is just running slowly',
      platform: 'windows',
      conversationHistory: [],
    });
    assert.ok(t1.reply.includes('browser') || t1.reply.includes('operating system'));

    // Turn 2: User specifies entire operating system
    const history1: Array<{ sender: 'user' | 'assistant'; text: string }> = [
      { sender: 'user', text: 'my computer is just running slowly' },
      { sender: 'assistant', text: t1.reply },
    ];
    const t2 = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'the entire operating system',
      platform: 'windows',
      conversationHistory: history1,
    });
    assert.ok(t2.reply.includes('begin suddenly today'));

    // Turn 3: User answers timing ("started today")
    const history2: Array<{ sender: 'user' | 'assistant'; text: string }> = [
      ...history1,
      { sender: 'user', text: 'the entire operating system' },
      { sender: 'assistant', text: t2.reply },
    ];
    const t3 = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'started today',
      platform: 'windows',
      conversationHistory: history2,
    });
    // Must NOT repeat the timing question! Must progress to diagnostic checks
    assert.ok(!t3.reply.includes('did this behavior begin suddenly today'));
    assert.ok(t3.reply.includes('check') || t3.reply.includes('slowdowns') || t3.reply.includes('metrics'));
    assert.ok(t3.quickReplies.some((r) => r.includes('browser check') || r.includes('system check')));

    // Turn 4: User repeats timing or says "its been happening over time"
    const history3: Array<{ sender: 'user' | 'assistant'; text: string }> = [
      ...history2,
      { sender: 'user', text: 'started today' },
      { sender: 'assistant', text: t3.reply },
    ];
    const t4 = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'its been happening over time',
      platform: 'windows',
      conversationHistory: history3,
    });
    assert.ok(!t4.reply.includes('did this behavior begin suddenly today'));
  });
});

describe('Phase 3: Gemini API Multi-Turn Content Formatting Invariant', () => {
  it('strictly alternates roles, drops leading assistant greetings, and merges consecutive turns', () => {
    const history: Array<{ sender: 'user' | 'assistant'; text: string }> = [
      { sender: 'assistant', text: 'Hello! What seems to be the issue?' },
      { sender: 'user', text: 'my computer is slow' },
      { sender: 'user', text: 'fans are spinning loud' },
      { sender: 'assistant', text: 'Running probe...' },
      { sender: 'assistant', text: 'Probe complete: CPU 95%' },
    ];

    const turns = buildGeminiContents(history, 'still happening what should I do next?', '[Context: Windows 11]');

    // Must start with user
    assert.strictEqual(turns[0].role, 'user');
    assert.ok(turns[0].parts[0].text.includes('[Context: Windows 11]'));
    // The two user messages must be merged
    assert.strictEqual(turns[0].parts.length, 2);

    // Turn 1 must be model (assistant probe messages merged)
    assert.strictEqual(turns[1].role, 'model');
    assert.strictEqual(turns[1].parts.length, 2);

    // Turn 2 must be user (the current message)
    assert.strictEqual(turns[2].role, 'user');
    assert.strictEqual(turns[2].parts[0].text, 'still happening what should I do next?');

    // Strict alternation check: no turn has the same role as the previous
    for (let i = 1; i < turns.length; i++) {
      assert.notStrictEqual(turns[i].role, turns[i - 1].role);
    }
  });
});

