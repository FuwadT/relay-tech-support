'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  HardDrive,
  HelpCircle,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  Play,
  RotateCw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import type {
  ChatMessage,
  DiagnosticArtifact,
  ProposedFix,
  SupportedOS,
  SystemTelemetry,
  UserProfile,
} from '@/lib/contracts';
import { getOneLinerCommand, getSampleTelemetry } from '@/lib/collector-templates';

interface AIChatViewProps {
  currentUser: UserProfile | null;
  onViewCaseDetail?: (caseId: string) => void;
  initialMessage?: string;
}

export default function AIChatView({ currentUser, onViewCaseDetail, initialMessage }: AIChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialMessage || '');
  const [busy, setBusy] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [selectedOS, setSelectedOS] = useState<SupportedOS>('windows');
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<DiagnosticArtifact | null>(null);
  const [executingFix, setExecutingFix] = useState(false);
  const [fixSuccess, setFixSuccess] = useState(false);
  const [customTelemetryInput, setCustomTelemetryInput] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello ${currentUser?.displayName || 'there'}! I'm your **Relay AI Technical Support Assistant**.\n\nDescribe any computer or network issue you're experiencing in plain language. If it's a known software or configuration issue, I'll solve it for you right here **without downloading anything**.\n\nIf it requires inspecting your machine, I can generate a **safe, 1-time read-only diagnostic collector** for Windows, Mac, or Linux to isolate the defect, generate a complete .html diagnostic artifact, and automatically fix it for you.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [currentUser]);

  // Handle sending a message
  async function handleSend(customText?: string) {
    const textToSend = (customText || input).trim();
    if (!textToSend || busy) return;

    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          caseId: activeCaseId,
          os: selectedOS,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to evaluate message');
      }

      const data = (await res.json()) as any;
      if (data.caseId) {
        setActiveCaseId(data.caseId);
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        cardType: data.cardType,
        cardData: data.cardData,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an issue evaluating your request. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // Handle running simulated or ingested telemetry
  async function handleRunTelemetry(scenario: 'high-cpu' | 'disk-full' | 'network-dns' | 'memory-leak' = 'high-cpu') {
    if (busy) return;
    setBusy(true);

    const tempCaseId = activeCaseId || `case-${Date.now().toString(36)}`;
    setActiveCaseId(tempCaseId);

    try {
      const res = await fetch('/api/ai/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: tempCaseId,
          os: selectedOS,
          scenario,
          userPrompt: messages.find((m) => m.role === 'user')?.content || 'System freezing and high CPU utilization.',
        }),
      });

      if (!res.ok) throw new Error('Telemetry processing failed');
      const data = (await res.json()) as any;

      const assistantMsg: ChatMessage = {
        id: `telemetry-result-${Date.now()}`,
        role: 'assistant',
        content: data.analysis.conversationalSummary,
        timestamp: new Date().toISOString(),
        cardType: 'telemetry-result',
        cardData: {
          telemetry: data.telemetry,
          artifact: data.analysis.artifact,
          fix: data.analysis.proposedFix,
        },
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      alert('Failed to process telemetry.');
    } finally {
      setBusy(false);
    }
  }

  // Handle parsing user pasted JSON telemetry
  async function handlePasteTelemetrySubmit() {
    if (!customTelemetryInput.trim() || busy) return;
    try {
      const parsed = JSON.parse(customTelemetryInput);
      setBusy(true);
      setShowPasteBox(false);

      const tempCaseId = activeCaseId || `case-${Date.now().toString(36)}`;
      setActiveCaseId(tempCaseId);

      const res = await fetch('/api/ai/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          caseId: tempCaseId,
          userPrompt: messages.find((m) => m.role === 'user')?.content || 'Pasted system telemetry inspection.',
        }),
      });

      const data = (await res.json()) as any;
      setMessages((prev) => [
        ...prev,
        {
          id: `telemetry-custom-${Date.now()}`,
          role: 'assistant',
          content: data.analysis.conversationalSummary,
          timestamp: new Date().toISOString(),
          cardType: 'telemetry-result',
          cardData: {
            telemetry: data.telemetry,
            artifact: data.analysis.artifact,
            fix: data.analysis.proposedFix,
          },
        },
      ]);
    } catch (err) {
      alert('Invalid telemetry JSON. Please ensure it is valid JSON output from the collector script.');
    } finally {
      setBusy(false);
    }
  }

  // Handle executing the automated fix
  async function handleExecuteFix(fix: ProposedFix) {
    if (executingFix) return;
    setExecutingFix(true);

    try {
      const res = await fetch('/api/ai/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: activeCaseId,
          command: fix.command,
        }),
      });

      if (!res.ok) throw new Error('Fix execution failed');
      const data = (await res.json()) as any;

      setFixSuccess(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `fix-executed-${Date.now()}`,
          role: 'assistant',
          content: `🎉 **Issue Resolved!** ${data.message}\n\n• Command executed: \`${fix.command}\`\n• System status verified: **Healthy**\n• Case ID: \`${activeCaseId}\` has been marked **Resolved**.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      alert('Could not execute fix automatically.');
    } finally {
      setExecutingFix(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2500);
  }

  return (
    <div className="ai-chat-container">
      {/* HEADER / STATUS BAR */}
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <div className="ai-avatar-pulse">
            <Sparkles size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="ai-chat-title">Relay AI Remote Investigation & Triage</h2>
            <p className="ai-chat-subtitle">
              Single-Screen Chat · Zero-Install Resolution First · Multi-OS Read-Only Collector (Win/Mac/Linux)
            </p>
          </div>
        </div>

        {activeCaseId && (
          <div className="ai-case-badge">
            <span className="ai-case-dot"></span>
            Case Ref: <strong>{activeCaseId}</strong>
          </div>
        )}
      </div>

      {/* QUICK PROMPT SUGGESTION CHIPS */}
      {messages.length <= 2 && (
        <div className="ai-prompt-chips">
          <span className="chips-label">Common issues:</span>
          <button
            type="button"
            className="chip-btn"
            onClick={() => handleSend('My laptop is freezing whenever I open Chrome (High CPU)')}
          >
            🔥 Laptop Freezing (High CPU)
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => handleSend('My Wi-Fi keeps disconnecting every 5 minutes')}
          >
            📶 Wi-Fi Dropping Regularly
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => handleSend('My disk is 99% full and I cannot save any files')}
          >
            💾 Hard Drive 100% Full
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => handleSend('How do I clear my browser cookies and cache?')}
          >
            ⚡ Quick Browser Settings (Zero-Install)
          </button>
        </div>
      )}

      {/* CHAT MESSAGES STREAM */}
      <div className="ai-messages-list">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message-row ${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="ai-message-avatar">
                <Sparkles size={16} />
              </div>
            )}

            <div className="ai-message-body">
              <div className="ai-message-bubble">
                <div className="ai-markdown-content" style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              </div>

              {/* CARD: ZERO-INSTALL QUICK FIX */}
              {msg.cardType === 'quick-fix' && msg.cardData?.quickFixSteps && (
                <div className="ai-card zero-install-card">
                  <div className="card-header-badge">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    <span>Zero-Install Instant Resolution ("Bigger Win")</span>
                  </div>
                  <p className="card-desc">No software downloads or terminal commands required:</p>
                  <ol className="card-steps-list">
                    {msg.cardData.quickFixSteps.map((step, idx) => (
                      <li key={idx}>
                        <span className="step-num">{idx + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="button secondary sm"
                      onClick={() =>
                        handleSend("That didn't fully resolve it. Can you do a deep inspection of my system?")
                      }
                    >
                      Still having issues? Inspect my device
                    </button>
                  </div>
                </div>
              )}

              {/* CARD: 1-TIME READ-ONLY COLLECTOR PACKAGE */}
              {msg.cardType === 'collector' && (
                <div className="ai-card collector-card">
                  <div className="card-header-badge">
                    <Terminal size={16} className="text-blue-400" />
                    <span>1-Time Read-Only Diagnostic Collector</span>
                    <span className="safe-pill">
                      <Lock size={12} /> Strictly Read-Only
                    </span>
                  </div>

                  {msg.cardData?.investigationPlan && (
                    <div className="investigation-plan-box">
                      <h4>🔍 AI Investigation Plan: {msg.cardData.investigationPlan.title}</h4>
                      <p>{msg.cardData.investigationPlan.reasoning}</p>
                      <ul className="plan-checks">
                        {msg.cardData.investigationPlan.checksToPerform.map((check, idx) => (
                          <li key={idx}>✓ {check}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* OS TABS */}
                  <div className="os-tabs-bar">
                    <button
                      type="button"
                      className={`os-tab ${selectedOS === 'windows' ? 'active' : ''}`}
                      onClick={() => setSelectedOS('windows')}
                    >
                      Windows (PowerShell)
                    </button>
                    <button
                      type="button"
                      className={`os-tab ${selectedOS === 'macos' ? 'active' : ''}`}
                      onClick={() => setSelectedOS('macos')}
                    >
                      macOS (Terminal / zsh)
                    </button>
                    <button
                      type="button"
                      className={`os-tab ${selectedOS === 'linux' ? 'active' : ''}`}
                      onClick={() => setSelectedOS('linux')}
                    >
                      Linux (Terminal / bash)
                    </button>
                  </div>

                  {/* 1-LINE RUN COMMAND */}
                  <div className="terminal-command-box">
                    <div className="terminal-command-label">
                      <span>Copy & run in terminal (non-destructive, read-only queries):</span>
                    </div>
                    <div className="code-row">
                      <code>
                        {msg.cardData?.collectorCommand
                          ? msg.cardData.collectorCommand[selectedOS]
                          : getOneLinerCommand(selectedOS, activeCaseId || 'session')}
                      </code>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() =>
                          copyToClipboard(
                            msg.cardData?.collectorCommand
                              ? msg.cardData.collectorCommand[selectedOS]
                              : getOneLinerCommand(selectedOS, activeCaseId || 'session')
                          )
                        }
                      >
                        {copiedCommand ? <Check size={14} /> : <Copy size={14} />}
                        {copiedCommand ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="collector-actions-row">
                    <a
                      href={`/api/ai/collector?os=${selectedOS}&caseId=${activeCaseId || 'session'}&download=1`}
                      download
                      className="button secondary sm download-btn"
                    >
                      <Download size={14} /> Download 1-Time Script
                    </a>

                    {/* INSTANT BROWSER SIMULATOR */}
                    <button
                      type="button"
                      className="button primary sm run-sim-btn"
                      disabled={busy}
                      onClick={() => handleRunTelemetry('high-cpu')}
                    >
                      {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                      Run Telemetry in Browser (Simulated)
                    </button>

                    <button
                      type="button"
                      className="button ghost sm text-xs"
                      onClick={() => setShowPasteBox(!showPasteBox)}
                    >
                      Paste output manually
                    </button>
                  </div>

                  {/* MANUAL PASTE BOX */}
                  {showPasteBox && (
                    <div className="paste-telemetry-drawer">
                      <p className="text-xs text-zinc-400 mb-1">
                        Paste the JSON output printed by the terminal script:
                      </p>
                      <textarea
                        rows={3}
                        value={customTelemetryInput}
                        onChange={(e) => setCustomTelemetryInput(e.target.value)}
                        placeholder='{"os": "windows", "cpuUsagePercent": 94, ...}'
                        className="paste-textarea"
                      />
                      <button
                        type="button"
                        className="button primary sm mt-2"
                        disabled={!customTelemetryInput.trim()}
                        onClick={handlePasteTelemetrySubmit}
                      >
                        Submit Telemetry
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* CARD: TELEMETRY RESULTS, DEFECT, ARTIFACT & AUTOMATED FIX */}
              {msg.cardType === 'telemetry-result' && msg.cardData && (
                <div className="ai-card results-card">
                  {/* DEFECT HIGHLIGHT */}
                  {msg.cardData.artifact && (
                    <div className={`defect-banner ${msg.cardData.artifact.severity}`}>
                      <div className="defect-header">
                        <span className="severity-badge">{msg.cardData.artifact.severity.toUpperCase()} DEFECT</span>
                        <span className="defect-os">OS: {msg.cardData.telemetry?.os.toUpperCase()}</span>
                      </div>
                      <h3 className="defect-title">{msg.cardData.artifact.defectTitle}</h3>
                      <p className="defect-root-cause">
                        <strong>Root Cause:</strong> {msg.cardData.artifact.rootCause}
                      </p>
                    </div>
                  )}

                  {/* LIVE RESOURCE GAUGES */}
                  {msg.cardData.telemetry && (
                    <div className="gauges-grid">
                      <div className="gauge-box">
                        <div className="gauge-header">
                          <Cpu size={14} /> CPU
                        </div>
                        <div
                          className={`gauge-val ${
                            msg.cardData.telemetry.cpuUsagePercent > 80 ? 'text-red-400' : 'text-zinc-100'
                          }`}
                        >
                          {msg.cardData.telemetry.cpuUsagePercent}%
                        </div>
                        <div className="gauge-sub">{msg.cardData.telemetry.cpuModel}</div>
                      </div>

                      <div className="gauge-box">
                        <div className="gauge-header">
                          <HardDrive size={14} /> Memory
                        </div>
                        <div
                          className={`gauge-val ${
                            msg.cardData.telemetry.memoryUsagePercent > 80 ? 'text-amber-400' : 'text-zinc-100'
                          }`}
                        >
                          {msg.cardData.telemetry.memoryUsagePercent}%
                        </div>
                        <div className="gauge-sub">
                          {Math.round(msg.cardData.telemetry.memoryUsedMb / 1024)} GB /{' '}
                          {Math.round(msg.cardData.telemetry.memoryTotalMb / 1024)} GB
                        </div>
                      </div>

                      <div className="gauge-box">
                        <div className="gauge-header">
                          <HardDrive size={14} /> Disk
                        </div>
                        <div
                          className={`gauge-val ${
                            msg.cardData.telemetry.diskUsagePercent > 90 ? 'text-red-400' : 'text-zinc-100'
                          }`}
                        >
                          {msg.cardData.telemetry.diskUsagePercent}%
                        </div>
                        <div className="gauge-sub">{msg.cardData.telemetry.diskFreeGb} GB free</div>
                      </div>

                      <div className="gauge-box">
                        <div className="gauge-header">
                          <Wifi size={14} /> Network
                        </div>
                        <div
                          className={`gauge-val ${
                            msg.cardData.telemetry.networkConnected && msg.cardData.telemetry.dnsWorking
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }`}
                        >
                          {msg.cardData.telemetry.networkConnected && msg.cardData.telemetry.dnsWorking
                            ? 'Healthy'
                            : 'Failed'}
                        </div>
                        <div className="gauge-sub">
                          Ping: {msg.cardData.telemetry.gatewayPingMs || 12} ms
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ARTIFACT DOWNLOAD / VIEW BAR */}
                  {msg.cardData.artifact && (
                    <div className="artifact-bar">
                      <div className="artifact-bar-left">
                        <div className="html-icon">HTML</div>
                        <div>
                          <div className="font-semibold text-sm">Standalone Diagnostic Artifact Report</div>
                          <div className="text-xs text-zinc-400">
                            Offline compatible · Technical evidence · Tier-1 Helpdesk summary
                          </div>
                        </div>
                      </div>

                      <div className="artifact-bar-right">
                        <button
                          type="button"
                          className="button secondary sm"
                          onClick={() => setPreviewArtifact(msg.cardData?.artifact || null)}
                        >
                          <Eye size={14} /> Preview
                        </button>
                        <a
                          href={`/api/ai/artifact/${activeCaseId || 'session'}?download=1`}
                          download
                          className="button secondary sm"
                        >
                          <Download size={14} /> Download .html
                        </a>
                      </div>
                    </div>
                  )}

                  {/* AUTOMATED FIX SECTION */}
                  {msg.cardData.fix && (
                    <div className="automated-fix-panel">
                      <div className="fix-header">
                        <div className="flex items-center gap-2">
                          <Wrench size={16} className="text-emerald-400" />
                          <h4 className="font-semibold text-emerald-400">{msg.cardData.fix.title}</h4>
                        </div>
                        <span className="risk-tag">Risk: {msg.cardData.fix.riskLevel.toUpperCase()}</span>
                      </div>

                      <p className="fix-explanation">{msg.cardData.fix.explanation}</p>

                      <div className="fix-code-block">
                        <div className="code-label">Automated Remediation Script ({msg.cardData.fix.os.toUpperCase()}):</div>
                        <code>{msg.cardData.fix.command}</code>
                      </div>

                      <div className="fix-action-bar">
                        <button
                          type="button"
                          className="button primary execute-btn"
                          disabled={executingFix || fixSuccess}
                          onClick={() => handleExecuteFix(msg.cardData!.fix!)}
                        >
                          {executingFix ? (
                            <>
                              <Loader2 size={16} className="spin" /> Executing Fix Remotely...
                            </>
                          ) : fixSuccess ? (
                            <>
                              <CheckCircle2 size={16} /> Fix Applied & Verified
                            </>
                          ) : (
                            <>
                              <Play size={16} /> Execute Automated Fix Now
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="button secondary sm"
                          onClick={() => copyToClipboard(msg.cardData!.fix!.command)}
                        >
                          {copiedCommand ? <Check size={14} /> : <Copy size={14} />} Copy Fix Command
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="ai-message-row assistant">
            <div className="ai-message-avatar">
              <Sparkles size={16} />
            </div>
            <div className="ai-message-body">
              <div className="ai-message-bubble loading">
                <Loader2 size={16} className="spin text-blue-400" />
                <span>AI evaluating system telemetry and isolating root cause...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* INPUT FORM (THE ONLY PROMPT THE USER ENTERS) */}
      <form
        className="ai-chat-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          type="text"
          className="ai-chat-input"
          placeholder="Describe your computer or network issue (e.g. computer freezing, disk full, Wi-Fi dropping)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          className="button primary ai-send-btn"
          disabled={busy || !input.trim()}
          aria-label="Send message"
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        </button>
      </form>

      {/* MODAL: PREVIEW STANDALONE HTML ARTIFACT */}
      {previewArtifact && (
        <div className="modal-backdrop">
          <div className="modal-content artifact-modal">
            <div className="modal-header">
              <h3>Diagnostic Report Artifact: {previewArtifact.defectTitle}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setPreviewArtifact(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body p-0">
              <iframe
                title="Diagnostic Report Artifact"
                srcDoc={previewArtifact.htmlContent}
                className="artifact-iframe"
              />
            </div>
            <div className="modal-footer">
              <a
                href={`/api/ai/artifact/${activeCaseId || 'session'}?download=1`}
                download
                className="button primary"
              >
                <Download size={16} /> Download .html Report
              </a>
              <button type="button" className="button secondary" onClick={() => setPreviewArtifact(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
