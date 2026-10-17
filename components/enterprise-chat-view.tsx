'use client';

/**
 * Enterprise Conversational Investigation & Remediation View.
 * Implements Relay Tech Support UX Redesign & Error Remediation Spec:
 * - Fix 1: Eliminates follow-up "amnesia loop" with multi-turn TriageStage state machine
 * - Fix 2: Socratic & deductive conversational triage flow ("What seems to be the issue you are having?")
 * - Fix 3: System temp folder paths for PowerShell/Bash collectors ($env:TEMP & /tmp)
 * - Fix 4: 1-Click Clipboard Ingestion & Auto-POST script callback integration
 * - Fix 5: Safe telemetry metric formatting (no bare '%', rounded GBs) & symptom-to-finding alignment
 * - Fix 6: Automatic OS detection synchronized across header badge and options
 * - Fix 7: Safe inline Markdown parser rendering **bold** and `code` tokens
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowDownToLine,
  Check,
  ClipboardPaste,
  Copy,
  Cpu,
  HardDrive,
  Laptop,
  Lock,
  Monitor,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Terminal,
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
import {
  analyzeEnterpriseTelemetry,
  generateSymptomAwareExplanation,
  explainTelemetryQuestion,
} from '@/lib/enterprise/findings';
import { buildEnterpriseReportHtml } from '@/lib/enterprise/diagnostic-report';
import { getCatalogAction } from '@/lib/enterprise/remediation-catalog';
import { validateTelemetrySnapshot } from '@/lib/enterprise/telemetry-validation';
import { getCollectorScript } from '@/lib/enterprise/collector-scripts';
import {
  runBrowserDiagnosticProbe,
  analyzeBrowserProbe,
} from '@/lib/browser-probe';
import { detectClientPlatform } from '@/lib/formatters';
import { FormattedMessage } from '@/components/ui/formatted-text';
import { TelemetryFindingsCard } from '@/components/diagnostics/telemetry-findings-card';
import { CollectorInstructionsCard } from '@/components/diagnostics/collector-instructions-card';
import { TriageQuickReplies } from '@/components/diagnostics/triage-quick-replies';

export type TriageStage =
  | 'intake_discovery'       // Initial greeting: "What seems to be the issue you are having?"
  | 'deductive_questioning'  // 1-2 clarifying questions with quick-reply chips before any downloads
  | 'browser_probe'          // Zero-install in-browser WebAPI diagnostics
  | 'awaiting_authorization' // Only reached if zero-install steps cannot resolve the issue
  | 'awaiting_telemetry'     // Waiting for 1-click browser probe, clipboard, or self-uploading collector
  | 'active_investigation';  // Telemetry is loaded; follow-up questions query the snapshot!

export interface EnterpriseChatViewProps {
  organizationId?: string;
  organizationName?: string;
  userId?: string;
  userRole?: 'requester' | 'technician' | 'administrator';
  initialCategory?: 'performance' | 'network';
  onNavigateHome?: () => void;
  onSwitchToManualForm?: () => void;
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

function getInitialWelcomeText(): string {
  return "Hello! What seems to be the issue you are having today? Describe what's happening in your own words, or pick a common symptom above.";
}

interface DeductiveBranch {
  category: string;
  question: string;
  quickReplies: string[];
}

function getDeductiveBranch(prompt: string): DeductiveBranch {
  const p = prompt.toLowerCase();
  if (p.includes('fan') || p.includes('heat') || p.includes('warm') || p.includes('overheat') || p.includes('noise')) {
    return {
      category: 'cpu',
      question: 'Does the fan noise and freezing happen right when you open a specific app (like your browser or video call), or even when idle?',
      quickReplies: ['While using browser', 'During video calls', 'Even when idle', 'Run system check now'],
    };
  }
  if (p.includes('portal') || p.includes('cache') || p.includes('cookie') || p.includes('permission') || p.includes('site')) {
    return {
      category: 'portal_cache',
      question: 'Is the portal displaying a specific error (like 403 Forbidden or 502 Bad Gateway), or is the page content visually blank or stuck loading?',
      quickReplies: ['Page blank or stuck loading', 'Permission / 403 Forbidden', 'Authentication loop', 'Run instant browser check'],
    };
  }
  if (p.includes('wifi') || p.includes('wi-fi') || p.includes('network') || p.includes('internet') || p.includes('dns') || p.includes('offline') || p.includes('gateway')) {
    return {
      category: 'network',
      question: 'Are all websites failing to load, or only specific internal/work pages?',
      quickReplies: ['All websites fail', 'Only specific sites', 'Connection drops randomly', 'Run network check now'],
    };
  }
  if (p.includes('disk') || p.includes('storage') || p.includes('space') || p.includes('full') || p.includes('drive')) {
    return {
      category: 'disk',
      question: "Are you seeing an 'Out of Disk Space' warning when saving files or installing updates?",
      quickReplies: ['Yes, disk full warning', 'System is just slow', 'Run disk check now'],
    };
  }
  if (p.includes('sluggish') || p.includes('slow') || p.includes('freeze') || p.includes('lag')) {
    return {
      category: 'slowness',
      question: 'Does this slowness occur primarily inside your web browser / a specific web app, or is the entire workstation sluggish even when idle?',
      quickReplies: ['In web browser / portal', 'Specific desktop app', 'Entire computer is sluggish', 'Run instant browser check'],
    };
  }
  if (p.includes('mic') || p.includes('camera') || p.includes('sound') || p.includes('audio')) {
    return {
      category: 'permission',
      question: 'Does the microphone or camera fail in all desktop applications, or only inside your web browser / video meeting?',
      quickReplies: ['In web browser meetings', 'In desktop apps (Zoom/Teams)', 'Device not detected at all', 'Run system check now'],
    };
  }
  return {
    category: 'general',
    question: 'Does this issue happen right after launching an application, or after using your device for an extended period?',
    quickReplies: ['Immediately on launch', 'After extended use', 'Random crashes', 'Run system check now'],
  };
}

function getZeroInstallSteps(answer: string, category: string): string[] {
  const a = answer.toLowerCase();
  if (a.includes('portal') || a.includes('cache') || a.includes('permission') || a.includes('cookie') || category === 'portal_cache') {
    return [
      'Click the site settings / padlock icon (🔒 or ⚙️) directly beside the portal URL in your address bar.',
      'Select "Site settings" (or "Permissions"), then click "Clear data" and "Reset permissions" to wipe corrupted localized caches.',
      'Press Ctrl + Shift + Delete (Cmd + Shift + Delete on macOS), choose "Cached images and files", and clear data.',
      'Test loading the portal in an Incognito / Private window (Ctrl + Shift + N) to rule out extension conflicts or hung Service Workers.',
    ];
  }
  if (a.includes('browser')) {
    return [
      'Open Browser Task Manager (Shift + Esc) to see which tab or extension is consuming high CPU or memory.',
      'Clear browser cache and cached images for sluggish sites.',
      'Disable heavy extensions (adblockers, script injectors) and test in an Incognito / Private window.',
    ];
  }
  if (a.includes('video call') || a.includes('meeting')) {
    return [
      'In your video meeting settings (Zoom/Teams/Meet), disable HD video and virtual background blur to reduce CPU load.',
      'Ensure hardware acceleration is enabled in application settings.',
      'Connect your laptop to power adapter; battery saver mode can throttle processor frequency.',
    ];
  }
  if (a.includes('idle')) {
    return [
      'Check if Windows Update or background security scans (Defender/antivirus) are actively indexing files.',
      'Restart your computer to release hung background services and clear volatile system caches.',
      'Verify laptop air vents and fans are unobstructed on a flat surface.',
    ];
  }
  if (a.includes('all website') || a.includes('all pages')) {
    return [
      'Toggle Airplane Mode ON for 10 seconds, then toggle OFF to reset the network adapter.',
      'Restart your local Wi-Fi router or cable modem if physically accessible.',
      'Verify whether your computer has a valid local IP address assigned via DHCP.',
    ];
  }
  if (a.includes('specific site')) {
    return [
      'Open the site in a Private / Incognito window to bypass stale DNS caches.',
      'Flush your browser socket pool (chrome://net-internals/#sockets).',
      'If using a corporate VPN, disconnect temporarily to test whether the internal gateway is down.',
    ];
  }
  if (a.includes('drops randomly')) {
    return [
      'Move closer to your Wi-Fi router or switch from 2.4 GHz to the 5 GHz wireless band.',
      'Disable Wi-Fi adapter power-saving mode in OS Device Manager / Energy Saver.',
      'Forget the Wi-Fi network and reconnect using fresh credentials.',
    ];
  }
  if (a.includes('disk full') || a.includes('yes, disk')) {
    return [
      'Empty the desktop Recycle Bin / Trash.',
      'Check your Downloads directory for large stale installer packages (.exe, .dmg, .iso) and delete them.',
      'Launch built-in Storage Sense (Windows Settings > Storage) or macOS Storage Manager to purge temporary files.',
    ];
  }
  return [
    'Perform a clean restart of your machine to flush transient memory leaks.',
    'Check for pending operating system updates that address known kernel crashes.',
    'Review task manager startup items and disable unneeded background utilities.',
  ];
}

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
  initialCategory,
  onNavigateHome,
  onSwitchToManualForm,
}: EnterpriseChatViewProps) {
  // State machine tracking active investigation phase (Fix 1)
  const [stage, setStage] = useState<TriageStage>('intake_discovery');
  const [reportedSymptomCategory, setReportedSymptomCategory] = useState<string>(initialCategory || 'general');
  const [pendingQuickReplies, setPendingQuickReplies] = useState<string[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: getInitialWelcomeText(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<DevicePlatform>(() =>
    typeof window !== 'undefined' ? detectClientPlatform() : 'windows'
  );
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [storageConsent, setStorageConsent] = useState(false);
  const [activeCase, setActiveCase] = useState<EnterpriseCase | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [activeFindings, setActiveFindings] = useState<EvidenceFinding[]>([]);
  const [, setActiveRemediation] = useState<RemediationProposal | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);

  // Script interaction state
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [pasteTelemetryOpen, setPasteTelemetryOpen] = useState(false);
  const [pastedTelemetryText, setPastedTelemetryText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [currentOrigin] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8790'
  );
  const [isRunningProbe, setIsRunningProbe] = useState(false);
  const [activeBrowserProbe, setActiveBrowserProbe] = useState<{
    platform?: string;
    hardwareConcurrency?: number | null;
    deviceMemoryGb?: number | null;
    networkOnline?: boolean;
    apiPingMs?: number | null;
    gpuRenderer?: string | null;
    isHealthy?: boolean;
    storageUsageGb?: number | null;
    storageQuotaGb?: number | null;
  } | null>(null);

  // AI Provider Integration State
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('relay_ai_provider') as 'gemini' | 'openai') || 'gemini';
    }
    return 'gemini';
  });
  const [aiApiKey, setAiApiKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('relay_ai_api_key') || '';
    }
    return '';
  });
  const [aiModel, setAiModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('relay_ai_model');
      if (stored && stored !== 'gemini-2.0-flash') {
        return stored;
      }
      localStorage.setItem('relay_ai_model', 'gemini-2.5-flash');
      return 'gemini-2.5-flash';
    }
    return 'gemini-2.5-flash';
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('relay_ai_api_key') || '';
    }
    return '';
  });
  const [saveStatus, setSaveStatus] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleRunBrowserProbe = async () => {
    if (isRunningProbe) return;
    setIsRunningProbe(true);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'user',
        text: 'Run Instant Browser Diagnostic (No Download)',
        timestamp: now,
      },
      {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: 'Running zero-install client-side WebAPI probe (checking hardware concurrency, memory capacity, network ping, and GPU renderer)...',
        timestamp: now,
      },
    ]);

    try {
      const result = await runBrowserDiagnosticProbe(
        selectedPlatform === 'windows' ? 'windows11' : selectedPlatform === 'macos' ? 'macos' : 'ubuntu'
      );
      const analysis = analyzeBrowserProbe(result);

      const probeSummary = {
        platform: result.platform,
        hardwareConcurrency: result.hardwareConcurrency,
        deviceMemoryGb: result.deviceMemoryGb,
        networkOnline: result.network.online,
        apiPingMs: result.timing.apiPingMs,
        gpuRenderer: result.gpuRenderer,
        isHealthy: analysis.isHealthy,
        storageUsageGb: result.storage.usageGb,
        storageQuotaGb: result.storage.quotaGb,
      };
      setActiveBrowserProbe(probeSummary);

      const probeDetails = [
        `• **Platform**: ${result.platform} (${result.hardwareConcurrency ? result.hardwareConcurrency + ' logical cores' : 'cores unmeasured'})`,
        `• **Memory**: ${result.deviceMemoryGb ? result.deviceMemoryGb + ' GB estimated' : 'unrestricted'}`,
        `• **Network Status**: ${result.network.online ? 'Online' : 'Offline'} (${result.timing.apiPingMs !== null ? result.timing.apiPingMs + ' ms server ping' : 'ping unmeasured'})`,
        `• **GPU Renderer**: \`${result.gpuRenderer || 'Default WebGL context'}\``,
        result.storage.quotaGb ? `• **Storage Quota**: ${result.storage.usageGb} GB used / ${result.storage.quotaGb} GB (${result.storage.freePercent}% free)` : null,
      ].filter(Boolean).join('\n');

      const observationLines = analysis.observations.map((o) => `• ${o}`).join('\n');
      const hypothesisLines = analysis.hypotheses.map((h) => `• *Hypothesis*: ${h}`).join('\n');

      const responseText = `**Zero-Install Browser WebAPI Diagnostic Completed:**\n\n${probeDetails}\n\n**Observations:**\n${observationLines}${hypothesisLines ? '\n\n**Initial Hypotheses:**\n' + hypothesisLines : ''}\n\n${
        analysis.potentialSoftwareRendering
          ? '⚠️ **Critical Finding**: GPU Hardware Acceleration is disabled! The browser is using CPU software rasterization, which directly triggers sustained high CPU and fan noise during media playback.'
          : analysis.isHealthy
          ? 'All core in-browser metrics are healthy. If you are experiencing OS-level freezes or fan noise outside the browser, we recommend running the read-only deep system check.'
          : 'Potential hardware/network constraints detected above.'
      }`;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...(analysis.isHealthy
          ? [
              {
                id: crypto.randomUUID(),
                sender: 'assistant' as const,
                text: 'Because core in-browser metrics and GPU acceleration are healthy, the slowdown is isolated to the operating system level. Let’s proceed to a non-elevated read-only diagnostic inspection to measure live CPU, memory, and running processes:',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                cardType: 'device-auth' as const,
              },
            ]
          : []),
      ]);

      if (analysis.isHealthy) {
        setPendingQuickReplies(['Authorize & Start Investigation', 'Show manual troubleshooting steps']);
        setStage('awaiting_authorization');
      } else {
        setPendingQuickReplies([
          'Solved my issue',
          'Still happening — run deep system check',
        ]);
        setStage('deductive_questioning');
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: 'Browser WebAPI probe encountered an error or was blocked by browser security settings. Would you like to proceed with the read-only OS collector?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsRunningProbe(false);
    }
  };

  const handleSaveAISettings = () => {
    if (typeof window !== 'undefined') {
      const cleanKey = tempApiKey.trim();
      localStorage.setItem('relay_ai_api_key', cleanKey);
      localStorage.setItem('relay_ai_provider', aiProvider);
      localStorage.setItem('relay_ai_model', aiModel);
      setAiApiKey(cleanKey);
      setSaveStatus('AI Settings Saved Successfully!');
      setTimeout(() => {
        setSaveStatus('');
        setShowSettingsModal(false);
      }, 700);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingQuickReplies]);

  // Ingests a validated telemetry snapshot and displays symptom-aware findings (Fix 1, 5)
  const ingestSnapshot = useCallback((snapshot: TelemetrySnapshot) => {
    setActiveSnapshot(snapshot);
    const findings = analyzeEnterpriseTelemetry(snapshot);
    setActiveFindings(findings);

    // Catalog remediation proposal matching based on evidence findings
    let remediation: RemediationProposal | null = null;
    const hasDnsFinding = findings.some((f) => f.id === 'dns-unsuccessful');
    const hasDiskFinding = findings.some((f) => f.id === 'disk-free-low');
    const hasCpuFinding = findings.some((f) => f.id === 'cpu-high');
    const hasMemoryFinding = findings.some((f) => f.id === 'memory-high');

    const systemNames = new Set([
      'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe',
      'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe', 'kernel_task',
      'launchd', 'systemd', 'init'
    ]);
    const topProcess = (snapshot.processes || []).find(
      (p) => typeof p.pid === 'number' && p.pid > 4 && p.name && !systemNames.has(p.name.toLowerCase())
    );

    if (hasDnsFinding) {
      const actionId = snapshot.platform === 'windows'
        ? 'win-net-flush-dns-cache'
        : snapshot.platform === 'macos'
          ? 'mac-net-flush-dns'
          : 'ubuntu-net-flush-resolve-cache';
      const action = getCatalogAction(actionId, snapshot.platform);
      if (action) {
        remediation = {
          id: crypto.randomUUID(),
          catalogActionId: action.id,
          catalogVersion: action.version,
          platform: snapshot.platform,
          evidenceIds: findings.filter((f) => f.id === 'dns-unsuccessful').map((f) => f.id),
          parameters: {},
          consequences: action.consequences,
          rollbackInstructions: action.rollbackInstructions,
          followUpCheckIds: action.followUpCheckIds,
          requiresElevation: false,
        };
      }
    } else if (hasDiskFinding && snapshot.platform === 'windows') {
      const action = getCatalogAction('win-disk-clean-user-temp', 'windows');
      if (action) {
        remediation = {
          id: crypto.randomUUID(),
          catalogActionId: action.id,
          catalogVersion: action.version,
          platform: 'windows',
          evidenceIds: findings.filter((f) => f.id === 'disk-free-low').map((f) => f.id),
          parameters: { daysOld: 7 },
          consequences: action.consequences,
          rollbackInstructions: action.rollbackInstructions,
          followUpCheckIds: action.followUpCheckIds,
          requiresElevation: false,
        };
      }
    } else if ((hasCpuFinding || hasMemoryFinding) && topProcess && typeof topProcess.pid === 'number' && topProcess.pid > 4) {
      const actionId = snapshot.platform === 'windows'
        ? 'win-proc-graceful-request'
        : snapshot.platform === 'macos'
          ? 'mac-proc-graceful-term'
          : 'ubuntu-proc-graceful-term';
      const action = getCatalogAction(actionId, snapshot.platform);
      if (action) {
        remediation = {
          id: crypto.randomUUID(),
          catalogActionId: action.id,
          catalogVersion: action.version,
          platform: snapshot.platform,
          evidenceIds: findings.filter((f) => f.id === 'cpu-high' || f.id === 'memory-high').map((f) => f.id),
          parameters: { pid: topProcess.pid, processName: topProcess.name },
          consequences: action.consequences,
          rollbackInstructions: action.rollbackInstructions,
          followUpCheckIds: action.followUpCheckIds,
          requiresElevation: false,
        };
      }
    }
    setActiveRemediation(remediation);
    setStage('active_investigation');

    const explanation = generateSymptomAwareExplanation(reportedSymptomCategory, snapshot, findings);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: explanation,
        timestamp: now,
        cardType: 'findings',
        findings,
        remediation: remediation || undefined,
      },
    ]);

    // Automatically trigger AI synthesis of telemetry findings and next steps (Zero re-prompting required)
    setIsGenerating(true);
    const remediationSummary = remediation
      ? {
          actionId: remediation.catalogActionId,
          targetPid:
            typeof remediation.parameters?.pid === 'number'
              ? remediation.parameters.pid
              : undefined,
          targetProcess:
            typeof remediation.parameters?.processName === 'string'
              ? remediation.parameters.processName
              : undefined,
          requiresElevation: false,
        }
      : null;

    fetch('/api/ai/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'active_investigation',
        userMessage:
          'Telemetry snapshot captured. Synthesize an immediate technical diagnosis of the top resource consumers and prioritize actionable next steps.',
        conversationHistory: [
          ...messages.map((m) => ({ sender: m.sender, text: m.text })),
          { sender: 'assistant', text: explanation },
        ],
        platform: selectedPlatform,
        snapshot,
        findings,
        browserProbe: activeBrowserProbe,
        remediation: remediationSummary,
        providerConfig: {
          provider: aiProvider,
          apiKey: aiApiKey,
          model: aiModel,
        },
      }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          data?: {
            reply?: string;
            quickReplies?: string[];
            isFallback?: boolean;
            fallbackReason?: string;
          };
        };
        if (json?.ok && json.data) {
          let replyText = json.data.reply || '';
          if (aiApiKey && json.data.isFallback && json.data.fallbackReason) {
            replyText = `${replyText}\n\n> ⚠️ **${aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'} Notice**: *${json.data.fallbackReason}*`;
          }
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'assistant',
              text: replyText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          if (json.data.quickReplies && json.data.quickReplies.length > 0) {
            setPendingQuickReplies(json.data.quickReplies);
          }
        }
      })
      .catch((err) => {
        console.warn('[Relay AI] Auto telemetry analysis error:', err);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [reportedSymptomCategory, messages, selectedPlatform, activeBrowserProbe, aiProvider, aiApiKey, aiModel]);

  // Background polling for direct script callback upload (Fix 4)
  useEffect(() => {
    if (stage !== 'awaiting_telemetry' || !activeCase?.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${activeCase.id}/telemetry`);
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; telemetry?: TelemetrySnapshot };
          if (data?.ok && data?.telemetry) {
            ingestSnapshot(data.telemetry);
          }
        }
      } catch {
        // Ignore polling errors while script runs
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [stage, activeCase?.id, ingestSnapshot]);

  const handleSendMessage = async (textToSend?: string) => {
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

    const lower = text.toLowerCase();
    if (
      lower.includes('run instant browser check') ||
      lower.includes('run browser check') ||
      lower.includes('browser check now') ||
      lower.includes('instant browser check') ||
      lower === 'run instant browser check (no download)'
    ) {
      void handleRunBrowserProbe();
      return;
    }

    const trimmed = text.trim();

    // If user pasted PowerShell Get-Process table, parse rows into activeSnapshot
    let effectiveSnapshot = activeSnapshot;
    if (trimmed.includes('Get-Process') && trimmed.includes('MemoryMB')) {
      const matches = [...trimmed.matchAll(/(\d+)\s+([a-zA-Z0-9 ._-]+?)\s+(\d+(?:\.\d+)?)/g)];
      if (matches.length > 0 && activeSnapshot) {
        const parsedProcs = matches.map((m) => ({
          pid: parseInt(m[1], 10),
          name: m[2].trim(),
          memoryMb: parseFloat(m[3]),
          cpuPercent: null,
        }));
        effectiveSnapshot = {
          ...activeSnapshot,
          processes: parsedProcs,
        };
        setActiveSnapshot(effectiveSnapshot);
      }
    }

    const isTerminalOutput =
      trimmed.includes('PS C:\\') ||
      trimmed.includes('Process not found') ||
      trimmed.includes('Get-Process') ||
      trimmed.includes('Telemetry copied') ||
      trimmed.includes('[Relay]') ||
      trimmed.length > 80;

    const isExplicitSystemCheckRequest =
      !isTerminalOutput &&
      (lower === 'run read-only system check' ||
        lower === 'run deep system check' ||
        lower === 'run system check' ||
        lower === 'still happening — run deep system check' ||
        lower === 'authorize & start investigation' ||
        lower === 'start deep check' ||
        lower === 'skip to os collector' ||
        /^(please\s+)?(run|start)\s+(the\s+)?(deep\s+|read-only\s+)?system\s+check$/i.test(lower));

    if (isExplicitSystemCheckRequest) {
      setPendingQuickReplies([]);
      setStage('awaiting_authorization');
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `Understood. Let’s proceed to a non-elevated diagnostic inspection to pinpoint the issue. Please authorize your device below:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            cardType: 'device-auth',
          },
        ]);
      }, 300);
      return;
    }

    // Call live AI Triage endpoint (/api/ai/triage)
    setIsGenerating(true);
    try {
      const remediationSummary = activeRemediation
        ? {
            actionId: activeRemediation.catalogActionId,
            targetPid:
              typeof activeRemediation.parameters?.pid === 'number'
                ? activeRemediation.parameters.pid
                : undefined,
            targetProcess:
              typeof activeRemediation.parameters?.processName === 'string'
                ? activeRemediation.parameters.processName
                : undefined,
            requiresElevation: false,
          }
        : null;

      const response = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          userMessage: text,
          conversationHistory: messages.map((m) => ({ sender: m.sender, text: m.text })),
          platform: selectedPlatform,
          snapshot: effectiveSnapshot,
          findings: activeFindings,
          browserProbe: activeBrowserProbe,
          remediation: remediationSummary,
          providerConfig: {
            provider: aiProvider,
            apiKey: aiApiKey,
            model: aiModel,
          },
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as {
          ok?: boolean;
          data?: {
            stage?: string;
            quickReplies?: string[];
            recommendedAction?: string;
            reply?: string;
            hypotheses?: Array<{
              id: string;
              domain: string;
              summary: string;
              confidence: number;
              status: string;
            }>;
            addressedSymptomMismatch?: boolean;
            isFallback?: boolean;
            fallbackReason?: string;
            providerUsed?: string;
            modelUsed?: string;
          };
        };
        if (json.ok && json.data) {
          const aiResponse = json.data;
          setStage(aiResponse.stage as TriageStage);
          setPendingQuickReplies(aiResponse.quickReplies || []);

          const cardType =
            aiResponse.recommendedAction === 'request_os_collector'
              ? 'device-auth'
              : undefined;

          let replyText = aiResponse.reply || '';
          if (aiApiKey && aiResponse.isFallback && aiResponse.fallbackReason) {
            replyText = `${replyText}\n\n> ⚠️ **${aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'} Notice**: *${aiResponse.fallbackReason}*`;
          }

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'assistant',
              text: replyText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              cardType,
            },
          ]);
          setIsGenerating(false);
          return;
        }
      }
    } catch {
      // Fall through to deterministic fallback if network or endpoint fails
    } finally {
      setIsGenerating(false);
    }

    // Deterministic fallback pipeline
    // STAGE 1: intake_discovery -> Deductive Questioning (Fix 2)
    if (stage === 'intake_discovery') {
      const branch = getDeductiveBranch(text);
      setReportedSymptomCategory(branch.category);
      setPendingQuickReplies(branch.quickReplies);
      setStage('deductive_questioning');

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `Understood. Before we download any diagnostic tools, let me ask one quick question to narrow this down:\n\n**${branch.question}**`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }, 400);
      return;
    }

    // STAGE 2: deductive_questioning -> Zero-Install or Authorization (Fix 2)
    if (stage === 'deductive_questioning') {
      setPendingQuickReplies([]);
      const steps = getZeroInstallSteps(text, reportedSymptomCategory);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `Based on your answer, here are recommended zero-install steps to resolve this without downloading diagnostic scripts:`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            cardType: 'zero-install',
            zeroInstallSteps: steps,
          },
        ]);
      }, 400);
      return;
    }

    // STAGE 3: awaiting_authorization
    if (stage === 'awaiting_authorization') {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `Please review the **Device Platform & Authorization** card above and click **Authorize & Start Investigation** to generate your diagnostic collector script.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }, 300);
      return;
    }

    // STAGE 4: awaiting_telemetry
    if (stage === 'awaiting_telemetry') {
      if (text.startsWith('{') && text.endsWith('}')) {
        try {
          const raw = JSON.parse(text);
          const validation = validateTelemetrySnapshot(raw);
          if (validation.ok) {
            ingestSnapshot(validation.value);
            return;
          }
        } catch {
          // Fall through
        }
      }
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `I am waiting to inspect your device telemetry. You can run the collector script in your terminal, click **1-Click Paste from Clipboard**, or choose a simulation scenario above.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }, 300);
      return;
    }

    // STAGE 5: active_investigation (Fix 1: Eliminate the Follow-Up "Amnesia Loop")
    if (stage === 'active_investigation' && activeSnapshot) {
      const groundedAnswer = explainTelemetryQuestion(
        text,
        activeSnapshot,
        activeFindings,
        reportedSymptomCategory
      );

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: groundedAnswer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }, 300);
      return;
    }
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
    setStage('awaiting_telemetry');

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

  // 1-Click "Paste from Clipboard" button (Fix 4)
  const handleOneClickPasteClipboard = async () => {
    try {
      setPasteError('');
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
        setPasteTelemetryOpen(true);
        return;
      }
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed || !trimmed.startsWith('{')) {
        setPasteTelemetryOpen(true);
        setPasteError('Clipboard did not contain JSON telemetry. Please paste the terminal output below:');
        return;
      }
      const raw = JSON.parse(trimmed);
      const validation = validateTelemetrySnapshot(raw);
      if (!validation.ok) {
        setPasteTelemetryOpen(true);
        setPasteError(`Invalid telemetry format: ${validation.error}`);
        return;
      }
      ingestSnapshot(validation.value);
    } catch {
      setPasteTelemetryOpen(true);
    }
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
      const raw = JSON.parse(trimmed);
      const validation = validateTelemetrySnapshot(raw);
      if (!validation.ok) {
        setPasteError(`Validation error: ${validation.error}`);
        return;
      }
      ingestSnapshot(validation.value);
      setPasteTelemetryOpen(false);
      setPastedTelemetryText('');
    } catch (err: unknown) {
      setPasteError(`JSON Syntax Error: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
    }
  };

  // Browser Simulation runner
  const handleRunSimulation = (scenario: 'cpu' | 'disk' | 'dns' | 'memory') => {
    setIsSimulating(true);
    setTimeout(() => {
      const syn = getSyntheticTelemetry(selectedPlatform, scenario);
      setIsSimulating(false);
      ingestSnapshot(syn);
    }, 400);
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
          <span className="badge badge-platform">
            {selectedPlatform === 'windows' ? 'WINDOWS 11' : selectedPlatform === 'macos' ? 'MACOS' : 'UBUNTU'}
          </span>
        </div>
        <div className="header-title">
          <h2>Relay Diagnostic Assistant</h2>
          <span className="text-muted text-sm">Non-Elevated · Zero-Install Resolution First · Evidence-Linked</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setTempApiKey(aiApiKey);
              setShowSettingsModal(true);
            }}
            className="button secondary btn-sm"
            title="Configure AI Provider & API Key"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: aiApiKey ? '1px solid #10b981' : '1px solid #f59e0b',
              background: aiApiKey ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              color: aiApiKey ? '#059669' : '#d97706',
              fontWeight: 600,
            }}
          >
            <Sparkles size={14} />
            <span>{aiApiKey ? `${aiProvider === 'gemini' ? 'Gemini AI' : 'OpenAI'} Active` : 'Connect AI Key'}</span>
          </button>
          {onSwitchToManualForm && (
            <button onClick={onSwitchToManualForm} className="button secondary btn-sm">
              Switch to manual form
            </button>
          )}
          {onNavigateHome && (
            <button onClick={onNavigateHome} className="button secondary btn-sm">
              Exit to Overview
            </button>
          )}
        </div>
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
              <div className="bubble-text">
                {<FormattedMessage text={m.text} />}
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
                        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            sender: 'user',
                            text: 'That fixed it! Thank you.',
                            timestamp: now,
                          },
                          {
                            id: crypto.randomUUID(),
                            sender: 'assistant',
                            text: 'Excellent! Glad the zero-install steps solved your problem without any downloads.',
                            timestamp: now,
                          },
                        ]);
                      }}
                    >
                      <Check size={14} />
                      Solved my issue
                    </button>
                    <button
                      className="button secondary btn-sm"
                      onClick={() => {
                        setStage('awaiting_authorization');
                        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            sender: 'user',
                            text: 'That did not resolve it. I need deeper technical diagnostics.',
                            timestamp: now,
                          },
                          {
                            id: crypto.randomUUID(),
                            sender: 'assistant',
                            text: 'Understood. Let’s proceed to a non-elevated diagnostic inspection to pinpoint the issue. Please authorize your device below:',
                            timestamp: now,
                            cardType: 'device-auth',
                          },
                        ]);
                      }}
                    >
                      Still happening — run deep system check
                    </button>
                    <button
                      type="button"
                      className="button secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={handleRunBrowserProbe}
                      disabled={isRunningProbe}
                    >
                      <Sparkles size={14} style={{ color: '#a44526' }} />
                      {isRunningProbe ? 'Probing WebAPIs…' : 'Run Instant Browser Check (No Download)'}
                    </button>
                  </div>
                </div>
              )}

              {/* Progressive Device Authorization Card */}
              {m.cardType === 'device-auth' && (
                <div className="interactive-card auth-card">
                  <div className="auth-card-header">
                    <div className="card-badge">🔐 Device Access & Consent</div>
                    <h4 className="auth-card-title">Device Platform & Authorization</h4>
                    <p className="auth-card-subtitle">
                      Select your operating system to generate a tailored, read-only diagnostic inspection script.
                    </p>
                  </div>

                  <div className="auth-section">
                    <label className="auth-section-label">Select Operating System</label>
                    <div className="platform-options-grid" role="radiogroup" aria-label="Select Operating System">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedPlatform === 'windows'}
                        className={`platform-option-box ${selectedPlatform === 'windows' ? 'selected' : ''}`}
                        onClick={() => setSelectedPlatform('windows')}
                      >
                        <div className="platform-box-top">
                          <div className="platform-icon-wrap">
                            <Monitor size={18} />
                          </div>
                          <div className={`radio-circle ${selectedPlatform === 'windows' ? 'checked' : ''}`}>
                            {selectedPlatform === 'windows' && <span className="radio-inner" />}
                          </div>
                        </div>
                        <div className="platform-title">Windows 11</div>
                        <div className="platform-desc">x64 · PowerShell 5.1+</div>
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedPlatform === 'macos'}
                        className={`platform-option-box ${selectedPlatform === 'macos' ? 'selected' : ''}`}
                        onClick={() => setSelectedPlatform('macos')}
                      >
                        <div className="platform-box-top">
                          <div className="platform-icon-wrap">
                            <Laptop size={18} />
                          </div>
                          <div className={`radio-circle ${selectedPlatform === 'macos' ? 'checked' : ''}`}>
                            {selectedPlatform === 'macos' && <span className="radio-inner" />}
                          </div>
                        </div>
                        <div className="platform-title">macOS Sequoia</div>
                        <div className="platform-desc">Apple Silicon · arm64</div>
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedPlatform === 'ubuntu'}
                        className={`platform-option-box ${selectedPlatform === 'ubuntu' ? 'selected' : ''}`}
                        onClick={() => setSelectedPlatform('ubuntu')}
                      >
                        <div className="platform-box-top">
                          <div className="platform-icon-wrap">
                            <Terminal size={18} />
                          </div>
                          <div className={`radio-circle ${selectedPlatform === 'ubuntu' ? 'checked' : ''}`}>
                            {selectedPlatform === 'ubuntu' && <span className="radio-inner" />}
                          </div>
                        </div>
                        <div className="platform-title">Ubuntu Linux</div>
                        <div className="platform-desc">22.04 / 24.04 LTS · x64</div>
                      </button>
                    </div>
                  </div>

                  <div className="auth-section">
                    <label className="auth-section-label">Required Authorizations</label>
                    <div className="consent-boxes-stack">
                      <label className={`consent-card-box ${deviceAuthorized ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          className="consent-checkbox"
                          checked={deviceAuthorized}
                          onChange={(e) => setDeviceAuthorized(e.target.checked)}
                        />
                        <div className="consent-card-content">
                          <div className="consent-card-title">
                            <ShieldCheck size={16} className="consent-title-icon" />
                            <span>Authorize Read-Only Diagnostic Inspection</span>
                          </div>
                          <p className="consent-card-desc">
                            Permits the non-elevated collection of resource metrics, network status, and redacted system events. No administrative privileges required.
                          </p>
                        </div>
                      </label>

                      <label className={`consent-card-box ${storageConsent ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          className="consent-checkbox"
                          checked={storageConsent}
                          onChange={(e) => setStorageConsent(e.target.checked)}
                        />
                        <div className="consent-card-content">
                          <div className="consent-card-title">
                            <Lock size={16} className="consent-title-icon" />
                            <span>30-Day Encrypted Telemetry Retention</span>
                          </div>
                          <p className="consent-card-desc">
                            Diagnostic snapshots are encrypted at rest and automatically purged after 30 days. You can permanently delete this record anytime.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="auth-card-footer">
                    <button
                      type="button"
                      className="button primary btn-auth-submit"
                      disabled={!deviceAuthorized || !storageConsent || caseSaving}
                      onClick={handleAuthorizeAndInvestigate}
                    >
                      {caseSaving ? (
                        <>
                          <RotateCw size={14} className="spin" />
                          <span>Registering Case...</span>
                        </>
                      ) : (
                        'Authorize & Start Investigation'
                      )}
                    </button>
                    {(!deviceAuthorized || !storageConsent) && (
                      <span className="auth-requirements-hint">
                        Please review and check both authorizations above to proceed.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Collector Instructions Card */}
              {m.cardType === 'collector' && (
                <CollectorInstructionsCard
                  scriptInfo={scriptInfo}
                  selectedPlatform={selectedPlatform}
                  currentOrigin={currentOrigin}
                  showScriptCode={showScriptCode}
                  onToggleShowScriptCode={() => setShowScriptCode(!showScriptCode)}
                  copiedScript={copiedScript}
                  onDownloadScript={handleDownloadScript}
                  onCopyScript={handleCopyScript}
                  onOneClickPasteClipboard={handleOneClickPasteClipboard}
                  pasteTelemetryOpen={pasteTelemetryOpen}
                  onTogglePasteTelemetryOpen={() => setPasteTelemetryOpen(!pasteTelemetryOpen)}
                  pastedTelemetryText={pastedTelemetryText}
                  onChangePastedTelemetryText={setPastedTelemetryText}
                  pasteError={pasteError}
                  onIngestPastedTelemetry={handleIngestPastedTelemetry}
                  onRunSimulation={handleRunSimulation}
                  isSimulating={isSimulating}
                />
              )}

              {/* Findings & Remediation Card */}
              {m.cardType === 'findings' && m.findings && (
                <TelemetryFindingsCard
                  findings={m.findings}
                  activeSnapshot={activeSnapshot}
                  remediation={m.remediation}
                  onDownloadReport={handleDownloadReport}
                />
              )}
            </div>
          </div>
        ))}

        {/* Quick Reply Chips (Fix 2) */}
        {stage === 'deductive_questioning' && (
          <TriageQuickReplies
            quickReplies={pendingQuickReplies}
            onSelectReply={handleSendMessage}
            onRunBrowserProbe={handleRunBrowserProbe}
            isRunningProbe={isRunningProbe}
          />
        )}

        {/* Generating indicator */}
        {isGenerating && (
          <div className="chat-bubble-row assistant">
            <div className="chat-bubble assistant" style={{ fontStyle: 'italic', opacity: 0.9 }}>
              <div className="bubble-header">
                <span className="sender-name">Relay Assistant</span>
                <span className="timestamp">Thinking...</span>
              </div>
              <div className="bubble-text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCw size={14} className="animate-spin" />
                <span>
                  {aiApiKey
                    ? `Generating diagnosis with ${aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}...`
                    : 'Analyzing diagnostic inquiry...'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <footer className="chat-input-bar">
        <form
          className="input-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          <input
            type="text"
            className="chat-input"
            placeholder={
              stage === 'active_investigation'
                ? 'Ask a follow-up about your CPU, memory, processes, or next steps...'
                : 'Describe what you notice or answer the assistant...'
            }
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
          />
          <button type="submit" className="button primary btn-sm" disabled={!inputPrompt.trim()}>
            Send
          </button>
        </form>
      </footer>

      {/* AI Settings Modal */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              color: '#1f2937',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>AI Provider Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '16px', lineHeight: 1.5 }}>
              Connect a real Generative AI model so Relay Assistant can answer complex questions, give exact step-by-step instructions (e.g. clearing localized web portal cache & permissions), and eliminate canned responses.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
                AI Model Provider
              </label>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const p = e.target.value as 'gemini' | 'openai';
                  setAiProvider(p);
                  if (p === 'gemini') setAiModel('gemini-2.5-flash');
                  else setAiModel('gpt-4o-mini');
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  backgroundColor: '#f9fafb',
                  color: '#111827',
                }}
              >
                <option value="gemini">Google Gemini (Recommended — Gemini 2.5 Flash)</option>
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
                Model
              </label>
              {aiProvider === 'gemini' ? (
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    backgroundColor: '#f9fafb',
                    color: '#111827',
                  }}
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended · Fast & Intelligent)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Reasoning)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Standard)</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (High Reasoning)</option>
                </select>
              ) : (
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    backgroundColor: '#f9fafb',
                    color: '#111827',
                  }}
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Fast & Cost-Effective)</option>
                  <option value="gpt-4o">gpt-4o (Full Capability)</option>
                </select>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                  {aiProvider === 'gemini' ? 'Google AI Studio API Key' : 'OpenAI API Key'}
                </label>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Stored in browser session</span>
              </div>
              <input
                type="password"
                placeholder={aiProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', lineHeight: 1.4 }}>
                Key is kept in your browser local storage. You can also set <code>GEMINI_API_KEY</code> in <code>.env.local</code> on the server.
              </p>
            </div>

            {saveStatus && (
              <div style={{ marginBottom: '14px', color: '#059669', fontSize: '13px', fontWeight: 600 }}>
                ✓ {saveStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="button secondary btn-sm"
                onClick={() => setShowSettingsModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary btn-sm"
                onClick={handleSaveAISettings}
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnterpriseChatView;
