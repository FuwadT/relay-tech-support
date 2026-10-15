import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateUserPrompt,
  analyzeTelemetry,
} from '../lib/ai-telemetry';
import {
  generateWindowsCollector,
  generateMacCollector,
  generateLinuxCollector,
  getOneLinerCommand,
  getSampleTelemetry,
} from '../lib/collector-templates';
import { buildDiagnosticArtifactHtml } from '../lib/diagnostic-artifact';

test('evaluateUserPrompt resolves browser cache/cookie issue with zero install ("Bigger Win")', () => {
  const result = evaluateUserPrompt('My Chrome browser is slow and some website not loading properly');
  assert.equal(result.canResolveZeroInstall, true);
  assert.ok(result.quickFixSteps && result.quickFixSteps.length > 0);
  assert.ok(result.conversationalResponse.includes('without downloading any software'));
  assert.equal(result.category, 'performance');
});

test('evaluateUserPrompt resolves microphone/permissions issue with zero install', () => {
  const result = evaluateUserPrompt('My microphone is not working on video calls');
  assert.equal(result.canResolveZeroInstall, true);
  assert.ok(result.quickFixSteps && result.quickFixSteps.length > 0);
  assert.ok(result.conversationalResponse.includes('without any installation'));
});

test('evaluateUserPrompt triggers deep telemetry investigation for system freezing and high CPU', () => {
  const result = evaluateUserPrompt('My laptop is freezing constantly and the fan is screaming at 100%');
  assert.equal(result.canResolveZeroInstall, false);
  assert.ok(result.investigationPlan);
  assert.equal(result.investigationPlan.title, 'System Hardware & Process Telemetry Investigation');
  assert.ok(result.investigationPlan.checksToPerform.some((c) => c.toLowerCase().includes('cpu')));
  assert.ok(result.conversationalResponse.includes('read-only diagnostic collector'));
});

test('evaluateUserPrompt triggers network adapter investigation for intermittent Wi-Fi drops', () => {
  const result = evaluateUserPrompt('My Wi-Fi keeps disconnecting every 5 minutes');
  assert.equal(result.canResolveZeroInstall, false);
  assert.equal(result.category, 'network');
  assert.ok(result.investigationPlan);
  assert.equal(result.investigationPlan.title, 'Network Stack & Interface Investigation');
  assert.ok(result.investigationPlan.checksToPerform.some((c) => c.toLowerCase().includes('dns') || c.toLowerCase().includes('adapter')));
});

test('collector scripts strictly enforce read-only execution across Windows, macOS, and Linux', () => {
  const caseId = 'case-test-123';
  const winScript = generateWindowsCollector(caseId, 'https://relay.test');
  const macScript = generateMacCollector(caseId, 'https://relay.test');
  const linuxScript = generateLinuxCollector(caseId, 'https://relay.test');

  // Windows checks
  assert.ok(winScript.includes('Strictly Read-Only'));
  assert.ok(winScript.includes('Get-CimInstance Win32_Processor'));
  assert.ok(winScript.includes('Get-Process'));
  assert.ok(winScript.includes('Get-WinEvent'));
  assert.ok(!winScript.includes('Remove-Item'));
  assert.ok(!winScript.includes('Format-Volume'));
  assert.ok(!winScript.includes('Set-Service'));

  // macOS checks
  assert.ok(macScript.includes('Strictly Read-Only'));
  assert.ok(macScript.includes('ps -A -o pid,%cpu,rss,comm'));
  assert.ok(macScript.includes('vm_stat'));
  assert.ok(macScript.includes('df -g /'));

  // Linux checks
  assert.ok(linuxScript.includes('Strictly Read-Only'));
  assert.ok(linuxScript.includes('ps -eo pid,%cpu,rss,comm'));
  assert.ok(linuxScript.includes('free -m'));
  assert.ok(linuxScript.includes('df -BG /'));

  // One-liner commands
  assert.ok(getOneLinerCommand('windows', caseId, 'https://relay.test').startsWith('irm '));
  assert.ok(getOneLinerCommand('macos', caseId, 'https://relay.test').startsWith('curl -fsSL '));
  assert.ok(getOneLinerCommand('linux', caseId, 'https://relay.test').startsWith('curl -fsSL '));
});

test('analyzeTelemetry accurately isolates high-CPU defect, PID, and generates automated fix', () => {
  const telemetry = getSampleTelemetry('high-cpu', 'windows');
  const userPrompt = 'My laptop is freezing whenever I open apps';
  const analysis = analyzeTelemetry(telemetry, userPrompt, 'case-high-cpu');

  assert.equal(analysis.severity, 'critical');
  assert.ok(analysis.defectTitle.includes('SearchIndexer.exe') || analysis.defectTitle.includes('4821'));
  assert.ok(analysis.rootCause.includes('SearchIndexer.exe') || analysis.rootCause.includes('loop'));
  assert.ok(analysis.evidence.length >= 2);
  assert.ok(analysis.helpdeskNotes.includes('TIER-1'));

  // Proposed Fix validation
  assert.ok(analysis.proposedFix);
  assert.ok(analysis.proposedFix.command.includes('Stop-Process'));
  assert.ok(analysis.proposedFix.command.includes('4821'));
  assert.equal(analysis.proposedFix.os, 'windows');
  assert.equal(analysis.proposedFix.riskLevel, 'safe');

  // Artifact validation
  assert.ok(analysis.artifact);
  assert.equal(analysis.artifact.defectTitle, analysis.defectTitle);
  assert.ok(analysis.artifact.htmlContent.includes('<!DOCTYPE html>'));
});

test('analyzeTelemetry detects storage starvation and generates disk cleanup remediation', () => {
  const telemetry = getSampleTelemetry('disk-full', 'linux');
  const userPrompt = 'Disk is full and cannot save downloads';
  const analysis = analyzeTelemetry(telemetry, userPrompt, 'case-disk-full');

  assert.equal(analysis.severity, 'critical');
  assert.ok(analysis.defectTitle.toLowerCase().includes('disk space') || analysis.defectTitle.includes('99.5%'));
  assert.ok(analysis.proposedFix.command.includes('journalctl --vacuum') || analysis.proposedFix.command.includes('clean'));
  assert.equal(analysis.proposedFix.os, 'linux');
});

test('analyzeTelemetry detects DNS breakdown and generates socket reset commands', () => {
  const telemetry = getSampleTelemetry('network-dns', 'windows');
  const userPrompt = 'Internet connected but websites cannot be reached';
  const analysis = analyzeTelemetry(telemetry, userPrompt, 'case-dns-drop');

  assert.equal(analysis.severity, 'critical');
  assert.ok(analysis.defectTitle.toLowerCase().includes('dns') || analysis.defectTitle.includes('resolver'));
  assert.ok(analysis.proposedFix.command.includes('ipconfig /flushdns'));
  assert.ok(analysis.proposedFix.command.includes('netsh winsock reset'));
});

test('buildDiagnosticArtifactHtml produces a standalone, self-contained, valid HTML document', () => {
  const telemetry = getSampleTelemetry('high-cpu', 'macos');
  const userPrompt = 'MacBook Pro UI freezing';
  const analysis = analyzeTelemetry(telemetry, userPrompt, 'case-mac-art');

  const html = buildDiagnosticArtifactHtml({
    caseId: 'case-mac-art',
    defectTitle: analysis.defectTitle,
    rootCause: analysis.rootCause,
    severity: analysis.severity,
    userPrompt,
    telemetry,
    proposedFix: analysis.proposedFix,
    helpdeskNotes: analysis.helpdeskNotes,
  });

  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<title>Relay AI Diagnostic Report - Case case-mac-art</title>'));
  assert.ok(html.includes('Relay AI Diagnostics'));
  assert.ok(html.includes(analysis.defectTitle));
  assert.ok(html.includes('Tier-1 Helpdesk Technician Handoff Sheet'));
  assert.ok(html.includes('Automated Remediation Script'));
  assert.ok(html.includes('kill -9'));
  assert.ok(html.includes('</html>'));

  // Verify offline self-containment: no remote script or css links
  assert.ok(!html.includes('<script src="http'));
  assert.ok(!html.includes('<link rel="stylesheet" href="http'));
});
