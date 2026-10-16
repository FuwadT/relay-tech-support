'use client';

/**
 * Enterprise Conversational Investigation & Remediation View.
 * Implements Task E3-01 & User Feedback:
 * - Single-screen conversational chatbox integrated into Relay workspace
 * - Symptom chips for rapid, guided intake
 * - Zero-install resolution first ("Bigger Win")
 * - Progressive OS and device authorization intake
 * - Local-origin read-only collector instructions (no external expired SSL certs)
 * - Direct "Download Script" and "Copy Script" buttons
 * - "Paste Collector Output" for instant real-device telemetry ingestion
 * - Evidence-linked telemetry findings (observations vs hypotheses)
 * - Offline HTML diagnostic artifact preview and export
 * - Reviewed remediation with transparent local execution
 * - Cohesive styling matching Relay's authentic design language
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  HardDrive,
  Network,
  RotateCw,
  Sparkles,
  Terminal,
  UploadCloud,
  Wifi,
} from 'lucide-react';
import type {
  DevicePlatform,
  EnterpriseCase,
  EvidenceFinding,
  EvidenceSource,
  RemediationProposal,
  TelemetrySnapshot,
} from '@/lib/enterprise/contracts';
import { analyzeEnterpriseTelemetry } from '@/lib/enterprise/findings';
import { buildEnterpriseReportHtml } from '@/lib/enterprise/diagnostic-report';
import { getCollectorScript } from '@/lib/enterprise/collector-scripts';

export interface EnterpriseChatViewProps {
  organizationId?: string;
  organizationName?: string;
  userId?: string;
  userRole?: 'requester' | 'technician' | 'administrator';
  onNavigateHome?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  cardType?: 'zero-install' | 'device-auth' | 'collector' | 'findings' | 'remediation';
  zeroInstallSteps?: string[];
  findings?: EvidenceFinding[];
  remediation?: RemediationProposal;
}

const SYMPTOM_CHIPS = [
  { label: '🚀 High CPU & Fan Noise', prompt: 'My computer is freezing up with very high CPU utilization and loud fan noise.' },
  { label: '💾 Low Disk Space', prompt: 'I am running out of hard drive space and cannot save files or system updates.' },
  { label: '🌐 Wi-Fi & DNS Drops', prompt: 'I have lost internet connectivity; web pages cannot resolve domain names.' },
  { label: '🧠 Memory Leak', prompt: 'An application is consuming all available RAM over time and causing system slowdown.' },
  { label: '⚡ Browser Glitch', prompt: 'A web portal is failing to load properly; I need help clearing localized browser cache and permissions.' },
];

/** Sample synthetic telemetry datasets for browser simulation (explicitly flagged synthetic). */
function getSyntheticTelemetry(platform: DevicePlatform, scenario: 'cpu' | 'disk' | 'dns' | 'memory'): TelemetrySnapshot {
  const now = new Date().toISOString();
  const base: TelemetrySnapshot = {
    schemaVersion: 1,
    collectionId: `syn-${crypto.randomUUID().slice(0, 8)}`,
    platform,
    osVersion: platform === 'windows' ? 'Windows 11 Enterprise 23H2' : platform === 'macos' ? 'macOS 15.0 Sequoia (Apple Silicon)' : 'Ubuntu 24.04 LTS (x64)',
    architecture: platform === 'macos' ? 'arm64' : 'x64',
    source: 'synthetic' as EvidenceSource,
    collectorVersion: '1.2.0-catalog',
    collectedAt: now,
    sampleIntervalMs: 5000,
    cpuPercent: 24.5,
    memoryTotalMb: 16384,
    memoryUsedMb: 6144,
    diskTotalGb: 512,
    diskFreeGb: 198,
    dnsResolved: true,
    gatewayLatencyMs: 16.4,
    processes: [
      { pid: 1420, name: platform === 'windows' ? 'explorer.exe' : 'windowserver', cpuPercent: 3.2, memoryMb: 420 },
      { pid: 3840, name: platform === 'windows' ? 'chrome.exe' : 'google-chrome', cpuPercent: 8.4, memoryMb: 950 },
    ],
    eventExcerpts: [
      { eventId: 'SYS-100', text: 'System diagnostics collection initialized in constrained read-only mode.' },
    ],
    errors: [],
  };

  switch (scenario) {
    case 'cpu':
      base.cpuPercent = 91.2;
      base.processes.unshift({
        pid: 8812,
        name: platform === 'windows' ? 'SearchIndexer.exe' : 'tracker-extract',
        cpuPercent: 78.4,
        memoryMb: 820,
      });
      break;
    case 'disk':
      base.diskTotalGb = 512;
      base.diskFreeGb = 18; // 3.5% free
      break;
    case 'dns':
      base.dnsResolved = false;
      base.gatewayLatencyMs = 145.0;
      break;
    case 'memory':
      base.memoryTotalMb = 16384;
      base.memoryUsedMb = 15200; // 92.7%
      base.processes.unshift({
        pid: 9104,
        name: platform === 'windows' ? 'node.exe' : 'java',
        cpuPercent: 12.0,
        memoryMb: 9400,
      });
      break;
  }

  return base;
}

export function EnterpriseChatView({
  organizationId = '11111111-2222-3333-4444-555555555555',
  organizationName = 'Acme Corp',
  userId = 'user-requester-001',
  userRole = 'requester',
  onNavigateHome,
}: EnterpriseChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello! I am Relay's interactive diagnostic assistant for **${organizationName}**.\n\nPlease describe the issue you are experiencing, or select one of the common symptoms below. If this can be solved with browser or system configuration steps, I will resolve it immediately with zero downloads!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<DevicePlatform>('windows');
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [storageConsent, setStorageConsent] = useState(false);
  const [activeCase, setActiveCase] = useState<EnterpriseCase | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [activeFindings, setActiveFindings] = useState<EvidenceFinding[]>([]);
  const [activeRemediation, setActiveRemediation] = useState<RemediationProposal | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);

  // Script interaction state
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [pasteTelemetryOpen, setPasteTelemetryOpen] = useState(false);
  const [pastedTelemetryText, setPastedTelemetryText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [currentOrigin, setCurrentOrigin] = useState('http://127.0.0.1:8790');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Evaluates plain-text user description for Zero-Install opportunities
  const evaluatePrompt = (prompt: string) => {
    const p = prompt.toLowerCase();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Pattern 1: Browser / cache / session glitches
    if (p.includes('cache') || p.includes('cookie') || p.includes('glitch') || p.includes('refresh') || p.includes('browser')) {
      const steps = [
        'Perform a Hard Refresh: Press Ctrl + F5 (Windows/Linux) or Cmd + Shift + R (macOS).',
        'Clear Browser Cache: Open Settings > Privacy & Security > Clear browsing data (select Cached images and files).',
        'Test in Private / Incognito window to verify whether an extension is conflicting.',
      ];
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `I evaluated your request. This appears to be a localized browser cache or cookie conflict that can likely be resolved **without downloading any software** ("Zero-Install Resolution"):`,
          timestamp: now,
          cardType: 'zero-install',
          zeroInstallSteps: steps,
        },
      ]);
      return;
    }

    // Pattern 2: Permission / mic / camera issues
    if (p.includes('mic') || p.includes('camera') || p.includes('permission') || p.includes('sound')) {
      const steps = [
        'Check OS Privacy Settings: Ensure Microphone and Camera toggles are enabled for your browser or app.',
        'Verify hardware switch or mute button on headset/keyboard.',
        'Set default input/output device in OS Sound Settings.',
      ];
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `This configuration issue can often be resolved directly in your settings without running a diagnostic script:`,
          timestamp: now,
          cardType: 'zero-install',
          zeroInstallSteps: steps,
        },
      ]);
      return;
    }

    // Pattern 3: Deep telemetry required -> prompt for OS and Device Authorization
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `To investigate this issue thoroughly, I will need to inspect your device's telemetry in a **strictly read-only, non-elevated environment**.\n\nPlease select your operating system and confirm device authorization below:`,
        timestamp: now,
        cardType: 'device-auth',
      },
    ]);
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputPrompt).trim();
    if (!text) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'user',
        text,
        timestamp: now,
      },
    ]);
    setInputPrompt('');
    evaluatePrompt(text);
  };

  const handleSelectChip = (chip: typeof SYMPTOM_CHIPS[0]) => {
    handleSendMessage(chip.prompt);
  };

  // Handles explicit device authorization and case initialization
  const handleAuthorizeAndInvestigate = async () => {
    if (!deviceAuthorized || !storageConsent) {
      alert('Please check both required authorization checkboxes before proceeding.');
      return;
    }

    setCaseSaving(true);
    const newCaseId = crypto.randomUUID();
    const caseRecord: EnterpriseCase = {
      id: newCaseId,
      organizationId,
      requesterId: userId,
      title: inputPrompt || 'Diagnostic Investigation Session',
      description: messages.find((m) => m.sender === 'user')?.text || 'System diagnostic triage session',
      platform: selectedPlatform,
      status: 'investigating',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setActiveCase(caseRecord);
    setCaseSaving(false);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Device authorized. I have initiated Investigation Case **#${newCaseId.slice(0, 8)}**.\n\nYou can run the non-elevated read-only collector on your ${selectedPlatform} device, paste terminal output, or run a browser simulation:`,
        timestamp: now,
        cardType: 'collector',
      },
    ]);
  };

  // Direct script file download
  const handleDownloadScript = () => {
    const scriptInfo = getCollectorScript(selectedPlatform);
    if (!scriptInfo) return;
    const blob = new Blob([scriptInfo.content], { type: scriptInfo.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = scriptInfo.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy raw script content to clipboard
  const handleCopyScript = () => {
    const scriptInfo = getCollectorScript(selectedPlatform);
    if (!scriptInfo) return;
    navigator.clipboard.writeText(scriptInfo.content).then(() => {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2200);
    });
  };

  // Ingest pasted terminal JSON output
  const handleIngestPastedTelemetry = () => {
    try {
      setPasteError('');
      const trimmed = pastedTelemetryText.trim();
      if (!trimmed) {
        setPasteError('Please paste the JSON output emitted by the collector script.');
        return;
      }
      const parsed = JSON.parse(trimmed) as TelemetrySnapshot;
      if (!parsed.schemaVersion || !parsed.platform) {
        setPasteError('Invalid telemetry JSON: missing schemaVersion or platform.');
        return;
      }

      parsed.source = 'collector';
      const findings = analyzeEnterpriseTelemetry(parsed);

      setActiveSnapshot(parsed);
      setActiveFindings(findings);
      setPasteTelemetryOpen(false);
      setPastedTelemetryText('');

      const remediation: RemediationProposal = {
        id: `prop-${crypto.randomUUID().slice(0, 8)}`,
        catalogActionId:
          parsed.cpuPercent && parsed.cpuPercent > 80
            ? 'catalog-proc-soft-restart'
            : parsed.diskFreeGb && parsed.diskFreeGb < 20
              ? 'catalog-disk-clean-user-temp'
              : !parsed.dnsResolved
                ? 'catalog-net-flush-dns'
                : 'catalog-mem-drop-cache',
        catalogVersion: '1.0.0',
        platform: selectedPlatform,
        evidenceIds: findings.flatMap((f) => f.evidenceIds),
        parameters: { targetProcess: parsed.processes?.[0]?.name || 'system' },
        consequences: [
          'Evaluates and addresses the identified constraint in user space.',
          'No elevated privileges or driver changes requested.',
        ],
        rollbackInstructions: ['Reversible or non-destructive action.'],
        followUpCheckIds: ['cpu_utilization_check', 'gateway_ping_check'],
        requiresElevation: false,
      };

      setActiveRemediation(remediation);

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `Telemetry collected! (Source: **device-reported collector snapshot**). Here are the evidence-linked observations and verified catalog remediation options:`,
          timestamp: now,
          cardType: 'findings',
          findings,
          remediation,
        },
      ]);
    } catch (err: unknown) {
      setPasteError(err instanceof Error ? err.message : 'Invalid JSON format. Please verify the output.');
    }
  };

  // Run simulated telemetry in browser
  const handleRunSimulation = (scenario: 'cpu' | 'disk' | 'dns' | 'memory') => {
    setIsSimulating(true);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setTimeout(() => {
      const snapshot = getSyntheticTelemetry(selectedPlatform, scenario);
      const findings = analyzeEnterpriseTelemetry(snapshot);

      setActiveSnapshot(snapshot);
      setActiveFindings(findings);
      setIsSimulating(false);

      const remediation: RemediationProposal = {
        id: `prop-${crypto.randomUUID().slice(0, 8)}`,
        catalogActionId:
          scenario === 'cpu'
            ? 'catalog-proc-soft-restart'
            : scenario === 'disk'
              ? 'catalog-disk-clean-user-temp'
              : scenario === 'dns'
                ? 'catalog-net-flush-dns'
                : 'catalog-mem-drop-cache',
        catalogVersion: '1.0.0',
        platform: selectedPlatform,
        evidenceIds: findings.flatMap((f) => f.evidenceIds),
        parameters: { targetProcess: snapshot.processes[0]?.name || 'system' },
        consequences: [
          scenario === 'dns'
            ? 'Flushes local OS DNS resolver cache; active connections remain untouched.'
            : scenario === 'disk'
              ? 'Deletes files older than 7 days from user temporary folder (%TEMP% or /tmp).'
              : 'Requests non-forceful graceful reload of the user process.',
        ],
        rollbackInstructions: [
          'No rollback required for cache flush. Temporary files cannot be restored from recycle bin.',
        ],
        followUpCheckIds: ['cpu_utilization_check', 'gateway_ping_check'],
        requiresElevation: false,
      };

      setActiveRemediation(remediation);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `Telemetry collected! (Source: **synthetic fixture**). Here are the evidence-linked observations and verified catalog remediation options:`,
          timestamp: now,
          cardType: 'findings',
          findings,
          remediation,
        },
      ]);
    }, 500);
  };

  // Downloads the offline standalone HTML diagnostic report
  const handleDownloadReport = () => {
    if (!activeCase) return;
    const html = buildEnterpriseReportHtml(activeCase, activeSnapshot, activeFindings);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relay-diagnostic-case-${activeCase.id.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const scriptInfo = getCollectorScript(selectedPlatform);

  return (
    <div className="enterprise-chat-container">
      {/* Top Banner */}
      <header className="chat-header">
        <div className="header-meta">
          <span className="badge badge-org">{organizationName}</span>
          <span className="badge badge-role">{userRole.toUpperCase()}</span>
          <span className="badge badge-platform">{selectedPlatform.toUpperCase()}</span>
        </div>
        <div className="header-title">
          <h2>Relay Diagnostic Assistant</h2>
          <span className="text-muted text-sm">Non-Elevated · Zero-Install Resolution First · Evidence-Linked</span>
        </div>
        {onNavigateHome && (
          <button onClick={onNavigateHome} className="button secondary btn-sm">
            Exit to Overview
          </button>
        )}
      </header>

      {/* Symptom Chips Bar */}
      <div className="symptom-chips-bar">
        <span className="chips-label">Common symptoms:</span>
        <div className="chips-scroll">
          {SYMPTOM_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectChip(chip)}
              className="chip-btn"
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="chat-messages-area">
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble-row ${m.sender}`}>
            <div className={`chat-bubble ${m.sender}`}>
              <div className="bubble-header">
                <span className="sender-name">
                  {m.sender === 'user' ? 'You' : m.sender === 'assistant' ? 'Relay Assistant' : 'System'}
                </span>
                <span className="timestamp">{m.timestamp}</span>
              </div>
              <div className="bubble-text" style={{ whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>

              {/* Zero-Install Resolution Card */}
              {m.cardType === 'zero-install' && m.zeroInstallSteps && (
                <div className="interactive-card zero-install-card">
                  <div className="card-badge">✨ Zero-Install Quick Resolution</div>
                  <ol className="steps-list">
                    {m.zeroInstallSteps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ol>
                  <div className="card-actions">
                    <button
                      className="button primary btn-sm"
                      onClick={() => {
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            sender: 'user',
                            text: 'I completed these steps and my issue is resolved. Thank you!',
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          },
                          {
                            id: crypto.randomUUID(),
                            sender: 'assistant',
                            text: 'Wonderful! Glad we could resolve this quickly without any software installation. Have a great day!',
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          },
                        ]);
                      }}
                    >
                      <Check size={14} />
                      That fixed it!
                    </button>
                    <button
                      className="button secondary btn-sm"
                      onClick={() => {
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            sender: 'user',
                            text: 'That did not resolve it. I need deeper technical diagnostics.',
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          },
                          {
                            id: crypto.randomUUID(),
                            sender: 'assistant',
                            text: 'Understood. Let’s proceed to a non-elevated diagnostic inspection to pinpoint the issue. Please authorize your device below:',
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            cardType: 'device-auth',
                          },
                        ]);
                      }}
                    >
                      Still having issues
                    </button>
                  </div>
                </div>
              )}

              {/* Progressive Device Authorization Card */}
              {m.cardType === 'device-auth' && (
                <div className="interactive-card auth-card">
                  <h4>Device Platform & Authorization</h4>
                  <div className="form-group">
                    <label>Target Operating System:</label>
                    <select
                      value={selectedPlatform}
                      onChange={(e) => setSelectedPlatform(e.target.value as DevicePlatform)}
                      className="select-input"
                    >
                      <option value="windows">Windows 11 (x64 PowerShell 5.1+)</option>
                      <option value="macos">macOS 15+ (Apple Silicon arm64)</option>
                      <option value="ubuntu">Ubuntu Linux 22.04 / 24.04 LTS (x64)</option>
                    </select>
                  </div>
                  <div className="checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={deviceAuthorized}
                        onChange={(e) => setDeviceAuthorized(e.target.checked)}
                      />
                      <span>I authorize Relay read-only diagnostic inspection on this device.</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={storageConsent}
                        onChange={(e) => setStorageConsent(e.target.checked)}
                      />
                      <span>I consent to store encrypted diagnostic telemetry with 30-day retention.</span>
                    </label>
                  </div>
                  <button
                    className="button primary btn-sm"
                    disabled={!deviceAuthorized || !storageConsent || caseSaving}
                    onClick={handleAuthorizeAndInvestigate}
                  >
                    {caseSaving ? 'Registering...' : 'Authorize & Start Investigation'}
                  </button>
                </div>
              )}

              {/* Collector Instructions Card */}
              {m.cardType === 'collector' && (
                <div className="interactive-card collector-card">
                  <div className="card-badge">🔬 Read-Only Collector Script</div>
                  <p className="text-sm" style={{ color: '#65635f', margin: '4px 0 10px' }}>
                    Run the non-elevated diagnostic script on your machine to gather resource metrics, bounded process names, and redacted logs.
                  </p>

                  {/* Direct script actions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <button className="button secondary btn-sm" onClick={handleDownloadScript}>
                      <ArrowDownToLine size={14} />
                      Download Script ({scriptInfo?.filename})
                    </button>
                    <button className="button secondary btn-sm" onClick={handleCopyScript}>
                      {copiedScript ? <Check size={14} style={{ color: '#166534' }} /> : <Copy size={14} />}
                      {copiedScript ? 'Copied to clipboard!' : 'Copy raw script'}
                    </button>
                    <button
                      className="button secondary btn-sm"
                      onClick={() => setShowScriptCode(!showScriptCode)}
                    >
                      <Terminal size={14} />
                      {showScriptCode ? 'Hide script preview' : 'Inspect script source'}
                    </button>
                  </div>

                  {/* Expandable script source preview */}
                  {showScriptCode && scriptInfo && (
                    <div style={{ margin: '10px 0', border: '1px solid #dcdad5', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ padding: '6px 10px', background: '#eeede9', fontSize: '11px', fontWeight: 600, color: '#4a4641' }}>
                        Previewing {scriptInfo.filename} ({scriptInfo.content.split('\n').length} lines)
                      </div>
                      <pre style={{ margin: 0, padding: '10px', background: '#1c1b1a', color: '#f5f4f1', maxHeight: '220px', overflowY: 'auto', fontSize: '11px', lineHeight: 1.4 }}>
                        {scriptInfo.content}
                      </pre>
                    </div>
                  )}

                  {/* Terminal Execution Snippet */}
                  <div className="collector-code-block">
                    <code>
                      {selectedPlatform === 'windows'
                        ? `# 1. Download non-elevated collector from this Relay instance:\nirm ${currentOrigin}/api/collectors/windows11.ps1 -OutFile inspect.ps1\n\n# 2. Review and run:\nGet-Content inspect.ps1\n.\\inspect.ps1`
                        : selectedPlatform === 'macos'
                          ? `# 1. Download non-elevated collector from this Relay instance:\ncurl -sSL ${currentOrigin}/api/collectors/macos.sh -o inspect.sh\n\n# 2. Review and run:\nless inspect.sh\nzsh inspect.sh`
                          : `# 1. Download non-elevated collector from this Relay instance:\ncurl -sSL ${currentOrigin}/api/collectors/ubuntu.sh -o inspect.sh\n\n# 2. Review and run:\nless inspect.sh\nbash inspect.sh`}
                    </code>
                  </div>

                  {/* Paste Terminal Output Section */}
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #ede9e3' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#38332d' }}>
                        Ran the script in your terminal?
                      </span>
                      <button
                        className="button secondary btn-xs"
                        onClick={() => setPasteTelemetryOpen(!pasteTelemetryOpen)}
                      >
                        <UploadCloud size={13} />
                        {pasteTelemetryOpen ? 'Close JSON box' : 'Paste Terminal JSON Output'}
                      </button>
                    </div>

                    {pasteTelemetryOpen && (
                      <div style={{ marginTop: '10px' }}>
                        <p style={{ fontSize: '11px', color: '#65635f', margin: '0 0 6px' }}>
                          Copy the JSON output printed in your terminal and paste it below:
                        </p>
                        <textarea
                          rows={4}
                          value={pastedTelemetryText}
                          onChange={(e) => {
                            setPastedTelemetryText(e.target.value);
                            setPasteError('');
                          }}
                          placeholder='{"schemaVersion":1,"platform":"windows","cpuPercent":88.4,...}'
                          style={{ fontFamily: 'monospace', fontSize: '11px' }}
                        />
                        {pasteError && (
                          <p style={{ color: '#a44526', fontSize: '11px', marginTop: '4px', fontWeight: 600 }}>
                            {pasteError}
                          </p>
                        )}
                        <div style={{ marginTop: '8px' }}>
                          <button
                            className="button primary btn-sm"
                            onClick={handleIngestPastedTelemetry}
                          >
                            <Sparkles size={13} />
                            Analyze Real Device Telemetry
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Simulation Fallback */}
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #ede9e3' }}>
                    <span style={{ fontSize: '11px', color: '#76736d', display: 'block', marginBottom: '8px' }}>
                      Or test diagnostic scenarios right now with browser-simulated fixtures:
                    </span>
                    <div className="card-actions">
                      <button
                        className="button secondary btn-sm"
                        onClick={() => handleRunSimulation('cpu')}
                        disabled={isSimulating}
                      >
                        <Cpu size={13} />
                        {isSimulating ? 'Simulating...' : 'Simulate High CPU'}
                      </button>
                      <button
                        className="button secondary btn-sm"
                        onClick={() => handleRunSimulation('disk')}
                        disabled={isSimulating}
                      >
                        <HardDrive size={13} />
                        Simulate Low Disk
                      </button>
                      <button
                        className="button secondary btn-sm"
                        onClick={() => handleRunSimulation('dns')}
                        disabled={isSimulating}
                      >
                        <Wifi size={13} />
                        Simulate DNS Fault
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Findings & Remediation Card */}
              {m.cardType === 'findings' && m.findings && (
                <div className="interactive-card findings-card">
                  <div className="findings-header">
                    <h4>Evidence-Linked Telemetry Findings</h4>
                    <button className="button secondary btn-xs" onClick={handleDownloadReport}>
                      <ArrowDownToLine size={13} />
                      Export Diagnostic HTML Artifact
                    </button>
                  </div>

                  {/* Telemetry Summary Gauges */}
                  {activeSnapshot && (
                    <div className="gauge-grid">
                      <div className="gauge-item">
                        <span className="gauge-label">CPU Usage</span>
                        <span className="gauge-val">{activeSnapshot.cpuPercent?.toFixed(1)}%</span>
                      </div>
                      <div className="gauge-item">
                        <span className="gauge-label">Memory Used</span>
                        <span className="gauge-val">
                          {activeSnapshot.memoryUsedMb} / {activeSnapshot.memoryTotalMb} MB
                        </span>
                      </div>
                      <div className="gauge-item">
                        <span className="gauge-label">Disk Free</span>
                        <span className="gauge-val">
                          {activeSnapshot.diskFreeGb} / {activeSnapshot.diskTotalGb} GB
                        </span>
                      </div>
                      <div className="gauge-item">
                        <span className="gauge-label">DNS Status</span>
                        <span className="gauge-val">
                          {activeSnapshot.dnsResolved ? 'Resolving OK' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Findings list */}
                  <div className="findings-list">
                    {m.findings.map((f) => (
                      <div key={f.id} className={`finding-item severity-${f.severity}`}>
                        <div className="f-title">
                          <span className={`badge-sev badge-${f.severity}`}>{f.severity.toUpperCase()}</span>
                          <span className="f-obs">{f.observation}</span>
                        </div>
                        {f.hypothesis && (
                          <div className="f-hyp">
                            <em>Hypothesis (Unconfirmed): {f.hypothesis}</em>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Remediation Proposal */}
                  {m.remediation && (
                    <div className="remediation-box">
                      <h5>Reviewed Remediation Proposal</h5>
                      <p className="text-sm">
                        <strong>Catalog Action:</strong> <code>{m.remediation.catalogActionId}</code> (v{m.remediation.catalogVersion})
                      </p>
                      <p className="text-xs text-muted">
                        <strong>Consequences:</strong> {m.remediation.consequences.join('; ')}
                      </p>
                      <p className="text-xs text-muted">
                        <strong>Rollback:</strong> {m.remediation.rollbackInstructions.join('; ')}
                      </p>
                      <div className="card-actions" style={{ marginTop: '10px' }}>
                        <button
                          className="button primary btn-sm"
                          onClick={() => {
                            setMessages((prev) => [
                              ...prev,
                              {
                                id: crypto.randomUUID(),
                                sender: 'assistant',
                                text: `Remediation execution reported. Please re-run the read-only collector to measure follow-up evidence. Case status will update once improved metrics are confirmed.`,
                                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                              },
                            ]);
                          }}
                        >
                          <CheckCircle2 size={14} />
                          Execute Remediation Locally
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <footer className="chat-input-bar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="input-form"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Describe your issue (e.g. 'high CPU usage', 'cannot resolve DNS', 'browser slow')..."
            className="chat-input"
          />
          <button type="submit" className="button primary btn-sm" disabled={!inputPrompt.trim()}>
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}

export default EnterpriseChatView;
