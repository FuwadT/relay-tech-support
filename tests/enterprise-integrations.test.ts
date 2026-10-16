/**
 * Tests for Assistant & Ticketing Integrations (Milestone 8).
 * Verifies ServiceNow, Jira, and Freshservice connectors, idempotent outbox,
 * payload sanitization, and scoped assistant tools for ChatGPT, Claude, Gemini, and Copilot.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EnterpriseCase } from '../lib/enterprise/contracts';
import {
  getAssistantToolDefinitions,
  executeAssistantTool,
  RELAY_ASSISTANT_TOOLS,
} from '../lib/enterprise/assistant-tools';
import {
  createTicketOutboxItem,
  dispatchTicketOutboxItem,
  sanitizeTicketPayload,
  validateTicketPayload,
  type ExternalTicketPayload,
} from '../lib/enterprise/ticket-connectors';

describe('E8-02: Ticketing Connectors (ServiceNow, Jira, Freshservice)', () => {
  it('sanitizeTicketPayload strips internal confidential notes', () => {
    const rawSummary = 'Customer reported high CPU. Charlie technician notes: customer is frustrated and requested discount.';
    const internalNotes = 'Charlie technician notes: customer is frustrated and requested discount.';

    const sanitized = sanitizeTicketPayload('High CPU', rawSummary, internalNotes);
    assert.ok(
      !sanitized.summary.includes('customer is frustrated and requested discount'),
      'Internal notes must be purged from external ticket payload',
    );
    assert.ok(sanitized.summary.includes('[REDACTED INTERNAL NOTES]'));
  });

  it('validateTicketPayload requires technician-approved summary', () => {
    const missingSummary = {
      organizationId: 'org-01',
      caseId: 'case-01',
      title: 'Problem title',
      approvedSummary: '', // Missing!
    };

    const result = validateTicketPayload(missingSummary);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Technician-approved summary is required'));
    }
  });

  it('createTicketOutboxItem preserves idempotencyKey to prevent duplicate tickets', () => {
    const payload: ExternalTicketPayload = {
      organizationId: 'org-01',
      caseId: 'case-01',
      title: 'Valid Ticket',
      approvedSummary: 'Approved summary for export.',
      severity: 'high',
    };

    const outboxItem1 = createTicketOutboxItem('servicenow', payload, 'custom-idempotency-key-1');
    assert.strictEqual(outboxItem1.idempotencyKey, 'custom-idempotency-key-1');
    assert.strictEqual(outboxItem1.provider, 'servicenow');
    assert.strictEqual(outboxItem1.status, 'pending');

    // Auto-generated UUID key if not provided
    const outboxItem2 = createTicketOutboxItem('jira-service-management', payload);
    assert.ok(outboxItem2.idempotencyKey.length > 10);
  });

  it('dispatchTicketOutboxItem creates external tickets for all three providers', async () => {
    const payload: ExternalTicketPayload = {
      organizationId: 'org-100',
      caseId: 'case-200',
      title: 'Printer issue',
      approvedSummary: 'Local printer driver stall.',
      severity: 'low',
    };

    // 1. ServiceNow
    const snItem = createTicketOutboxItem('servicenow', payload);
    const snResult = await dispatchTicketOutboxItem(snItem);
    assert.strictEqual(snResult.ok, true);
    if (snResult.ok) {
      assert.ok(snResult.link.externalId.startsWith('INC'));
      assert.strictEqual(snResult.link.provider, 'servicenow');
    }

    // 2. Jira Service Management
    const jiraItem = createTicketOutboxItem('jira-service-management', payload);
    const jiraResult = await dispatchTicketOutboxItem(jiraItem);
    assert.strictEqual(jiraResult.ok, true);
    if (jiraResult.ok) {
      assert.ok(jiraResult.link.externalId.startsWith('RELAY-'));
      assert.strictEqual(jiraResult.link.provider, 'jira-service-management');
    }

    // 3. Freshservice
    const fsItem = createTicketOutboxItem('freshservice', payload);
    const fsResult = await dispatchTicketOutboxItem(fsItem);
    assert.strictEqual(fsResult.ok, true);
    if (fsResult.ok) {
      assert.ok(fsResult.link.externalId.startsWith('TICK-'));
      assert.strictEqual(fsResult.link.provider, 'freshservice');
    }
  });
});

describe('E8-01: Assistant Ecosystem Tools (ChatGPT, Claude, Gemini, Copilot)', () => {
  it('exports tools in native schemas for all four ecosystems', () => {
    // 1. ChatGPT
    const chatGptTools = getAssistantToolDefinitions('chatgpt') as Array<{ type: string; function: { name: string } }>;
    assert.strictEqual(chatGptTools[0].type, 'function');
    assert.ok(chatGptTools.some((t) => t.function.name === 'relay_get_case_summary'));

    // 2. Claude
    const claudeTools = getAssistantToolDefinitions('claude') as Array<{ name: string; input_schema: unknown }>;
    assert.ok(claudeTools.some((t) => t.name === 'relay_list_approved_remediations'));

    // 3. Gemini
    const geminiTools = getAssistantToolDefinitions('gemini') as Array<{ name: string; parameters: unknown }>;
    assert.ok(geminiTools.some((t) => t.name === 'relay_get_diagnostic_report_meta'));

    // 4. Copilot Studio
    const copilotTools = getAssistantToolDefinitions('copilot') as Array<{ name: string; inputs: unknown }>;
    assert.ok(copilotTools.some((t) => t.name === 'relay_get_case_summary'));
  });

  it('strictly excludes any shell execution or terminal commands from assistant tools', () => {
    for (const tool of RELAY_ASSISTANT_TOOLS) {
      assert.ok(!tool.name.includes('exec'), `Tool ${tool.name} must not be an exec tool`);
      assert.ok(!tool.name.includes('terminal'), `Tool ${tool.name} must not be a terminal tool`);
      assert.ok(!tool.name.includes('shell'), `Tool ${tool.name} must not be a shell tool`);
      assert.ok(!tool.name.includes('run_command'), `Tool ${tool.name} must not run commands`);
    }
  });

  it('executeAssistantTool relay_list_approved_remediations returns non-elevated actions only', async () => {
    const result = await executeAssistantTool(
      'relay_list_approved_remediations',
      { platform: 'windows' },
      { organizationId: 'org-test', userRole: 'requester' },
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      const data = result.data as { count: number; actions: Array<{ requiresElevation: boolean }> };
      assert.ok(data.count > 0);
      for (const a of data.actions) {
        assert.strictEqual(a.requiresElevation, false, 'Actions returned to assistants must be non-elevated');
      }
    }
  });

  it('executeAssistantTool rejects unapproved tool invocations', async () => {
    const result = await executeAssistantTool(
      'relay_run_arbitrary_bash_command',
      { command: 'cat /etc/passwd' },
      { organizationId: 'org-test', userRole: 'requester' },
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Arbitrary command execution is forbidden'));
    }
  });
});
