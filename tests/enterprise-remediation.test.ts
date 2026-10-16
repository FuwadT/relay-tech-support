import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  createRemediationProposal, getCatalogAction, getUnavailableCatalogReason,
  listCatalogActions, validateRemediationProposal,
} from '../lib/enterprise/remediation-catalog';

const actionId = 'win-proc-graceful-request';
const target = { pid: 1234, processName: 'notepad', processStartTime: '2026-10-16T01:02:03.004Z' };
const evidence = ['/processes/0/pid'];
const proposal = () => createRemediationProposal(actionId, 'windows', evidence, target)!;
const action = getCatalogAction(actionId, 'windows')!;

describe('remediation boundary groundwork (renders only; no native execution)', () => {
  it('removes irreversible cleanup and disables unverified DNS and Unix signal actions', () => {
    const disabled = [
      ['win-disk-clean-user-temp', 'windows'], ['win-net-flush-dns-cache', 'windows'],
      ['mac-net-flush-dns', 'macos'], ['mac-proc-graceful-term', 'macos'],
      ['ubuntu-net-flush-resolve-cache', 'ubuntu'], ['ubuntu-proc-graceful-term', 'ubuntu'],
    ] as const;
    for (const [id, platform] of disabled) {
      assert.equal(getCatalogAction(id, platform), null);
      assert.equal(createRemediationProposal(id, platform, evidence, target), null);
      assert.equal(validateRemediationProposal({ ...proposal(), catalogActionId: id, platform }).ok, false);
      assert.ok(getUnavailableCatalogReason(id, platform));
    }
    assert.deepEqual(listCatalogActions('macos'), []);
    assert.deepEqual(listCatalogActions('ubuntu'), []);
  });

  it('requires explicit PID, name, start identity and evidence before proposal creation', () => {
    const partials: Array<Record<string, string | number | boolean>> = [{}, { pid: 1234 }, { pid: 1234, processName: 'notepad' }];
    for (const partial of partials) {
      assert.equal(createRemediationProposal(actionId, 'windows', evidence, partial), null);
      assert.throws(() => action.renderScript(partial));
      assert.equal(validateRemediationProposal({ ...proposal(), parameters: partial }).ok, false);
    }
    assert.equal(createRemediationProposal(actionId, 'windows', [], target), null);
    assert.equal(validateRemediationProposal({ ...proposal(), evidenceIds: [] }).ok, false);
  });

  it('rejects zero, negative, fractional, nonfinite, oversized and string PIDs at all boundaries', () => {
    for (const pid of [0, -1, -100, 1.5, NaN, Infinity, -Infinity, 2147483648, '1234']) {
      const parameters = { ...target, pid };
      assert.equal(createRemediationProposal(actionId, 'windows', evidence, parameters), null);
      assert.throws(() => action.renderScript(parameters));
      assert.equal(validateRemediationProposal({ ...proposal(), parameters }).ok, false);
    }
  });

  it('rejects executable values, extra parameters, inherited values and accessors', () => {
    let getterRead = false;
    const parametersList = [
      { ...target, processName: "notepad'; Write-Output forged; '" },
      { ...target, processName: '$(Write-Output forged)' },
      { ...target, processName: 'note\npad' },
      { ...target, processName: '*notepad*' },
      { ...target, processName: ' notepad ' },
      { ...target, arbitraryCommand: 'echo forged' },
      { ...target, processStartTime: '2026-02-31T00:00:00.000Z' },
      { ...target, processStartTime: '2026-10-16T01:02:03Z' },
      Object.create(target),
      Object.defineProperty({ ...target }, 'pid', { enumerable: true, get() { getterRead = true; return 1234; } }),
    ];
    for (const parameters of parametersList) {
      assert.equal(createRemediationProposal(actionId, 'windows', evidence, parameters), null);
      assert.throws(() => action.renderScript(parameters));
      assert.equal(validateRemediationProposal({ ...proposal(), parameters }).ok, false);
    }
    assert.equal(getterRead, false);
  });

  it('rejects changed versions, platforms, elevation, disclosure text and unknown fields', () => {
    for (const change of [
      { catalogVersion: '1.0.0' }, { platform: 'ubuntu' }, { requiresElevation: true },
      { consequences: ['Guaranteed repair without risk.'] }, { rollbackInstructions: [] },
      { followUpCheckIds: ['run_arbitrary_shell'] }, { extra: true }, { id: 'not-a-proposal' },
    ]) assert.equal(validateRemediationProposal({ ...proposal(), ...change }).ok, false);
    assert.equal(validateRemediationProposal({ ...proposal(), evidenceIds: Array(1) }).ok, false);
  });

  it('copies validated target/evidence so caller mutation cannot change a proposal', () => {
    const input = { ...target };
    const refs = [...evidence];
    const created = createRemediationProposal(actionId, 'windows', refs, input)!;
    input.pid = 999; refs[0] = 'changed';
    assert.deepEqual(created.parameters, target);
    assert.deepEqual(created.evidenceIds, evidence);
    const validated = validateRemediationProposal(created);
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    created.parameters.pid = 555; created.evidenceIds[0] = 'changed-again';
    assert.deepEqual(validated.value.parameters, target);
    assert.deepEqual(validated.value.evidenceIds, evidence);
  });

  it('renders ownership/session/start guards and truthful window-request results', () => {
    const script = action.renderScript(target);
    assert.match(script, /GetOwnerSid/);
    assert.match(script, /WindowsIdentity.*GetCurrent/);
    assert.match(script, /\$owner\.Sid -cne \$currentSid/);
    assert.match(script, /\$proc\.SessionId -ne \$currentSession/);
    assert.match(script, /\$proc\.ProcessName -cne \$expectedName/);
    assert.equal((script.match(/\$proc\.StartTime/g) ?? []).length, 2);
    assert.match(script, /\$proc\.MainWindowHandle -eq \[IntPtr\]::Zero/);
    assert.match(script, /if \(-not \$proc\.CloseMainWindow\(\)\) \{ throw/);
    assert.ok(script.indexOf('GetOwnerSid') < script.indexOf('.CloseMainWindow()'));
    assert.match(script, /request sent.*actual outcome and gather follow-up readings/);
    assert.doesNotMatch(script, /Remove-Item|Stop-Process|killall|kill -|Clear-Dns|resolvectl|Set-ItemProperty|Start-Process|-Force|SilentlyContinue|\|\| true/);
  });

  it('parses the rendered script with Windows PowerShell without executing it', { skip: process.platform !== 'win32' }, () => {
    const parseOnly = '$source = [Console]::In.ReadToEnd(); $tokens = $null; $errors = $null; '
      + '[void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors); '
      + 'if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }; Write-Output "parse-only passed"';
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', parseOnly], {
      input: action.renderScript(target), encoding: 'utf8', timeout: 10000, windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
    assert.match(result.stdout, /parse-only passed/);
  });
});
