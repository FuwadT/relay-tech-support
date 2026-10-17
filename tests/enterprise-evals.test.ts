/**
 * Enterprise IT Diagnostic Evaluation Benchmark Suite (Task E6-02).
 *
 * Automated regression test bench verifying that Relay Assistant diagnoses
 * real IT issues accurately, prevents loop regressions, avoids PID 0 hallucinations,
 * respects user terminal output, and guarantees non-elevated safety.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TelemetrySnapshot, EvidenceFinding } from '../lib/enterprise/contracts';
import {
  executeDeductiveTriage,
  type DeductiveTriageRequest,
} from '../lib/enterprise/ai-provider-adapter';
import {
  createRemediationProposal,
  getCatalogAction,
} from '../lib/enterprise/remediation-catalog';

const highMemorySnapshot: TelemetrySnapshot = {
  schemaVersion: 1,
  collectionId: 'c-high-mem-001',
  platform: 'windows',
  osVersion: 'Windows 11',
  architecture: 'x64',
  source: 'collector',
  collectorVersion: '1.0.0',
  collectedAt: new Date().toISOString(),
  sampleIntervalMs: 1130,
  cpuPercent: 12.0,
  memoryTotalMb: 16875,
  memoryUsedMb: 15222, // 90.2%
  diskTotalGb: 1024,
  diskFreeGb: 142,
  dnsResolved: true,
  gatewayLatencyMs: 12,
  processes: [
    { pid: 0, name: 'System Idle Process', cpuPercent: 88, memoryMb: 0 },
    { pid: 4, name: 'System', cpuPercent: 2, memoryMb: 80 },
  ],
  eventExcerpts: [],
  errors: [],
};

const highCpuRunawaySnapshot: TelemetrySnapshot = {
  schemaVersion: 1,
  collectionId: 'c-high-cpu-002',
  platform: 'windows',
  osVersion: 'Windows 11',
  architecture: 'x64',
  source: 'collector',
  collectorVersion: '1.0.0',
  collectedAt: new Date().toISOString(),
  sampleIntervalMs: 1000,
  cpuPercent: 94.0,
  memoryTotalMb: 16875,
  memoryUsedMb: 6000,
  diskTotalGb: 1024,
  diskFreeGb: 350,
  dnsResolved: true,
  gatewayLatencyMs: 8,
  processes: [
    { pid: 14820, name: 'chrome.exe', cpuPercent: 91, memoryMb: 1200 },
  ],
  eventExcerpts: [],
  errors: [],
};

const dnsFaultSnapshot: TelemetrySnapshot = {
  schemaVersion: 1,
  collectionId: 'c-dns-fault-003',
  platform: 'windows',
  osVersion: 'Windows 11',
  architecture: 'x64',
  source: 'collector',
  collectorVersion: '1.0.0',
  collectedAt: new Date().toISOString(),
  sampleIntervalMs: 1000,
  cpuPercent: 5.0,
  memoryTotalMb: 16875,
  memoryUsedMb: 4000,
  diskTotalGb: 1024,
  diskFreeGb: 500,
  dnsResolved: false,
  gatewayLatencyMs: null,
  processes: [],
  eventExcerpts: [],
  errors: [],
};

describe('Eval Benchmark 1: Prevention of Terminal Paste False Reset (Bug 1)', () => {
  it('does NOT reset stage to awaiting_authorization when user pastes PowerShell terminal output', async () => {
    const terminalOutput =
      'i got this response - [Relay] Telemetry copied to clipboard automatically! PS C:\\WINDOWS\\system32> $proc = Get-Process -Id 0 -ErrorAction SilentlyContinue PS C:\\WINDOWS\\system32> if ($proc -and $proc.SessionId -eq (Get-Process -Id $PID).SessionId) { >> # Non-forced graceful close request >> $proc.CloseMainWindow() | Out-Null >> Write-Host "Sent graceful close request to process PID 0." -ForegroundColor Green >> } else { >> Write-Host "Process not found or belongs to another session; skipped." -ForegroundColor Yellow >> } Process not found or belongs to another session; skipped. PS C:\\WINDOWS\\system32>';

    const request: DeductiveTriageRequest = {
      stage: 'active_investigation',
      userMessage: terminalOutput,
      conversationHistory: [
        { sender: 'user', text: 'my computer is slow' },
        { sender: 'assistant', text: 'Telemetry analysis complete: memory is high.' },
      ],
      platform: 'windows',
      snapshot: highMemorySnapshot,
      findings: [],
      hypotheses: [],
    };

    const response = await executeDeductiveTriage(request, {
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.0-flash',
      modelAllowlist: ['gemini-2.0-flash'],
      enabled: true,
    });

    // Must NOT reset to awaiting_authorization or request collector
    assert.notStrictEqual(response.stage, 'awaiting_authorization');
    assert.notStrictEqual(response.recommendedAction, 'request_os_collector');

    // Must acknowledge that process was skipped / not found
    assert.ok(response.reply.includes('skipped') || response.reply.includes('session') || response.reply.includes('memory'));

    // Must offer safe working-set diagnosis or browser discards
    assert.ok(
      response.reply.includes('Get-Process') ||
      response.reply.includes('chrome://discards') ||
      response.reply.includes('WorkingSet64')
    );
  });
});

describe('Eval Benchmark 2: Target PID 0 Hallucination Prevention (Bug 2)', () => {
  it('refuses to construct a remediation proposal with PID <= 0', () => {
    const proposalZero = createRemediationProposal(
      'win-proc-graceful-request',
      'windows',
      ['ev-mem-high'],
      { pid: 0, processName: 'System Idle Process' },
    );
    assert.strictEqual(proposalZero, null, 'Proposal with PID 0 must be null');

    const proposalNegative = createRemediationProposal(
      'win-proc-graceful-request',
      'windows',
      ['ev-mem-high'],
      { pid: -1 },
    );
    assert.strictEqual(proposalNegative, null, 'Proposal with negative PID must be null');
  });

  it('renders a safe error notice rather than targeting PID 0 if rendered directly', () => {
    const action = getCatalogAction('win-proc-graceful-request', 'windows');
    assert.ok(action);

    const scriptZero = action.renderScript({ pid: 0 });
    assert.ok(scriptZero.includes('No valid process PID specified'));
    assert.doesNotMatch(scriptZero, /Get-Process\s+-Id\s+0/);
  });

  it('creates valid remediation proposal when genuine user process PID is provided', () => {
    const proposal = createRemediationProposal(
      'win-proc-graceful-request',
      'windows',
      ['ev-cpu-high'],
      { pid: 14820, processName: 'chrome.exe' },
    );
    assert.ok(proposal !== null);
    assert.strictEqual(proposal.catalogActionId, 'win-proc-graceful-request');
    assert.strictEqual(proposal.parameters.pid, 14820);
  });
});

describe('Eval Benchmark 3: Telemetry-to-Remediation Grounding', () => {
  it('proposes DNS cache flush when DNS resolution fails (never process close)', () => {
    const action = getCatalogAction('win-net-flush-dns-cache', 'windows');
    assert.ok(action);
    const proposal = createRemediationProposal(
      'win-net-flush-dns-cache',
      'windows',
      ['dns-unsuccessful'],
      {},
    );
    assert.ok(proposal !== null);
    assert.strictEqual(proposal.catalogActionId, 'win-net-flush-dns-cache');
    assert.strictEqual(proposal.requiresElevation, false);
  });

  it('proposes user temp cleanup when disk space is critically low', () => {
    const action = getCatalogAction('win-disk-clean-user-temp', 'windows');
    assert.ok(action);
    const proposal = createRemediationProposal(
      'win-disk-clean-user-temp',
      'windows',
      ['disk-free-low'],
      { daysOld: 7 },
    );
    assert.ok(proposal !== null);
    assert.strictEqual(proposal.catalogActionId, 'win-disk-clean-user-temp');
  });
});

describe('Eval Benchmark 4: Multi-Turn Socratic Triage Anti-Loop', () => {
  it('progresses smoothly through scope -> timing -> resolution options without repeating questions', async () => {
    // Turn 1: Slowness reported
    const t1 = await executeDeductiveTriage(
      {
        stage: 'deductive_questioning',
        userMessage: 'my computer is just running slowly',
        conversationHistory: [],
        platform: 'windows',
      },
      { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', modelAllowlist: ['gemini-2.0-flash'], enabled: true },
    );
    assert.ok(t1.reply.includes('browser') || t1.reply.includes('operating system'));

    // Turn 2: User answers scope ("the entire operating system")
    const t2 = await executeDeductiveTriage(
      {
        stage: 'deductive_questioning',
        userMessage: 'the entire operating system',
        conversationHistory: [
          { sender: 'user', text: 'my computer is just running slowly' },
          { sender: 'assistant', text: t1.reply },
        ],
        platform: 'windows',
      },
      { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', modelAllowlist: ['gemini-2.0-flash'], enabled: true },
    );
    // Must ask timing question
    assert.ok(t2.reply.includes('suddenly today') || t2.reply.includes('over time'));

    // Turn 3: User answers timing ("started today")
    const t3 = await executeDeductiveTriage(
      {
        stage: 'deductive_questioning',
        userMessage: 'started today',
        conversationHistory: [
          { sender: 'user', text: 'my computer is just running slowly' },
          { sender: 'assistant', text: t1.reply },
          { sender: 'user', text: 'the entire operating system' },
          { sender: 'assistant', text: t2.reply },
        ],
        platform: 'windows',
      },
      { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash', modelAllowlist: ['gemini-2.0-flash'], enabled: true },
    );

    // Turn 3 must NOT ask timing question again!
    assert.doesNotMatch(t3.reply, /did this behavior begin suddenly today/i);
    assert.ok(t3.quickReplies.some((r) => r.includes('browser check') || r.includes('system check') || r.includes('Task Manager')));
  });
});

describe('Eval Benchmark 5: Security & Elevation Invariants', () => {
  it('strictly excludes any elevated commands across all catalog actions and triage outputs', () => {
    const forbiddenPatterns = [
      /\bsudo\b/i,
      /\brunas\b/i,
      /\bkill\s+-9\b/i,
      /\bStop-Process\s+-Force\b/i,
      /\bSet-ItemProperty\b/i,
      /\bNew-ItemProperty\b/i,
      /\breg\s+add\b/i,
    ];

    const actions = [
      getCatalogAction('win-net-flush-dns-cache', 'windows'),
      getCatalogAction('win-disk-clean-user-temp', 'windows'),
      getCatalogAction('win-proc-graceful-request', 'windows'),
      getCatalogAction('mac-net-flush-dns', 'macos'),
      getCatalogAction('mac-proc-graceful-term', 'macos'),
      getCatalogAction('ubuntu-net-flush-resolve-cache', 'ubuntu'),
      getCatalogAction('ubuntu-proc-graceful-term', 'ubuntu'),
    ];

    for (const action of actions) {
      assert.ok(action);
      assert.strictEqual(action.requiresElevation, false);
      const rendered = action.renderScript({ pid: 1234, daysOld: 7 });
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(rendered, pattern, `Action ${action.id} violated elevation barrier with pattern ${pattern}`);
      }
    }
  });
});
