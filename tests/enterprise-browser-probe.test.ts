import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isBrowserProbeIntent, isExplicitSystemCheckIntent } from '../lib/browser-probe';
import { executeDeductiveTriage } from '../lib/enterprise/ai-provider-adapter';

describe('E8-01: Browser Probe & Diagnostic Intent Detection', () => {
  it('detects direct browser probe intent across common user expressions', () => {
    const directPhrases = [
      'run browser diagnostic',
      'Run Instant Browser Diagnostic (No Download)',
      'run instant browser check (no download)',
      'run the browser tool',
      'browser tool',
      'run browser probe',
      'please run the browser test',
      'check browser',
      'run the zero install',
      'zero-install diagnostic',
      'yes run the install',
      'run install',
      'probe browser now',
      'webapi diagnostic',
    ];

    for (const phrase of directPhrases) {
      assert.strictEqual(
        isBrowserProbeIntent(phrase),
        true,
        `Expected "${phrase}" to be recognized as browser probe intent`,
      );
    }
  });

  it('detects contextual affirmative replies when assistant offered browser check', () => {
    const assistantPrompt =
      "Would you like me to run a quick, zero-install diagnostic on your browser's performance? This will check for common issues like too many tabs or extensions.";

    const affirmativeReplies = [
      'yes',
      'yes please',
      'run it',
      'sure',
      'ok',
      'okay',
      'go ahead',
      'please',
      'proceed',
      "let's do it",
      'yes run the install',
    ];

    for (const reply of affirmativeReplies) {
      assert.strictEqual(
        isBrowserProbeIntent(reply, assistantPrompt),
        true,
        `Expected "${reply}" following assistant prompt to be recognized as browser probe intent`,
      );
    }
  });

  it('rejects unrelated messages from triggering browser probe', () => {
    const unrelated = [
      'my computer is running slowly',
      'is gemini connected?',
      'the fan is very loud',
      'how do i check task manager',
      'it started yesterday',
      'all the time',
    ];

    for (const phrase of unrelated) {
      assert.strictEqual(
        isBrowserProbeIntent(phrase),
        false,
        `Expected "${phrase}" NOT to trigger browser probe`,
      );
    }
  });

  it('detects explicit system check and OS collector requests', () => {
    const systemCheckPhrases = [
      'collect a snapshot',
      'take a snapshot',
      'run read-only system check',
      'run deep system check',
      'run system check',
      'still happening — run deep system check',
      'authorize & start investigation',
      'skip to os collector',
      'run os collector',
      'please collect a telemetry snapshot',
    ];

    for (const phrase of systemCheckPhrases) {
      assert.strictEqual(
        isExplicitSystemCheckIntent(phrase),
        true,
        `Expected "${phrase}" to be recognized as explicit system check intent`,
      );
    }
  });

  it('executeDeductiveTriage transitions to browser_probe and recommends run_browser_probe', async () => {
    const res = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'yes run the install',
      platform: 'windows',
      conversationHistory: [
        {
          sender: 'assistant',
          text: "Would you like me to run a quick, zero-install diagnostic on your browser's performance?",
        },
      ],
    });

    assert.strictEqual(res.stage, 'browser_probe');
    assert.strictEqual(res.recommendedAction, 'run_browser_probe');
    assert.ok(res.reply.toLowerCase().includes('zero-install'));
  });

  it('executeDeductiveTriage handles direct "run the browser tool"', async () => {
    const res = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'run the browser tool',
      platform: 'windows',
    });

    assert.strictEqual(res.stage, 'browser_probe');
    assert.strictEqual(res.recommendedAction, 'run_browser_probe');
  });

  it('executeDeductiveTriage transitions to awaiting_authorization on "collect a snapshot"', async () => {
    const res = await executeDeductiveTriage({
      stage: 'deductive_questioning',
      userMessage: 'collect a snapshot',
      platform: 'windows',
    });

    assert.strictEqual(res.stage, 'awaiting_authorization');
    assert.strictEqual(res.recommendedAction, 'request_os_collector');
  });
});
