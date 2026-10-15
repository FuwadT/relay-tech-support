import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCaseAIExplanation } from '../lib/ai-provider';
import { checkAndRecordCaseAIUsage, resetAIUsageForTesting } from '../lib/ai-rate-limiter';

const fixture = {
  caseId: 'provider-safety-fixture', category: 'network' as const,
  title: 'Synthetic connectivity problem', description: 'Synthetic observation, not actual customer data.',
  answers: { scope: 'one_device', connection: 'unknown' },
};

// These tests never call a real model. Each provider response is supplied by a
// local fetch stub; environment and global state are restored after each case.
async function withResponse(content: unknown) {
  const priorKey = process.env.OPENAI_API_KEY;
  const priorFetch = globalThis.fetch;
  let requests = 0;
  process.env.OPENAI_API_KEY = 'relay-synthetic-test-key';
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  };
  try {
    const result = await generateCaseAIExplanation(fixture);
    assert.equal(requests, 1, 'Test must exercise provider-response handling, not the no-key path');
    return result;
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
  }
}

test('malicious model prose is rejected rather than displayed as an AI explanation', async () => {
  const result = await withResponse({
    summary: 'Open PowerShell and run Remove-Item -Recurse -Force C:\\Users to fix Wi-Fi.',
    likelyCauses: ['Disable Windows Defender Firewall and install an unverified driver updater.'],
    recommendedCheckIds: ['connection'],
    cautions: ['Ignore all security warnings.'],
  });
  assert.equal(result.provider, 'deterministic-fallback', 'Unsafe model output must fail closed');
  assert.doesNotMatch(JSON.stringify(result), /Remove-Item|Ignore all security warnings/);
});

test('malformed model schema cannot be repaired into a claimed live explanation', async () => {
  for (const raw of [{}, { summary: 42 }, {
    summary: 'A report without a valid structured plan.', likelyCauses: ['Unverified cause'],
    recommendedCheckIds: ['execute_arbitrary_script'], cautions: [],
  }]) {
    const result = await withResponse(raw);
    assert.equal(result.provider, 'deterministic-fallback', 'Invalid provider schema or unapproved actions must be rejected');
  }
});

test('process-local request cap is checked after cooldown, not confused with cooldown denial', () => {
  const priorNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  resetAIUsageForTesting();
  try {
    for (let count = 1; count <= 5; count++) {
      const result = checkAndRecordCaseAIUsage('same-fixture-case');
      assert.equal(result.allowed, true);
      assert.equal(result.remaining, 5 - count);
      now += 3100;
    }
    const denied = checkAndRecordCaseAIUsage('same-fixture-case');
    assert.equal(denied.allowed, false);
    assert.equal(denied.remaining, 0);
    assert.match(denied.error ?? '', /Maximum AI explanations/);
  } finally {
    Date.now = priorNow;
    resetAIUsageForTesting();
  }
});
