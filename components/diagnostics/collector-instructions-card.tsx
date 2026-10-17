'use client';

import React from 'react';
import {
  ArrowDownToLine,
  Check,
  ClipboardPaste,
  Copy,
  Cpu,
  HardDrive,
  Sparkles,
  Terminal,
  Wifi,
} from 'lucide-react';
import type { DevicePlatform } from '@/lib/enterprise/contracts';
import { getCollectorTerminalSnippet } from '@/lib/enterprise/collector-scripts';

export interface CollectorInstructionsCardProps {
  scriptInfo?: { filename: string; content: string } | null;
  selectedPlatform: DevicePlatform;
  currentOrigin: string;
  showScriptCode: boolean;
  onToggleShowScriptCode: () => void;
  copiedScript: boolean;
  onDownloadScript: () => void;
  onCopyScript: () => void;
  onOneClickPasteClipboard: () => void;
  pasteTelemetryOpen: boolean;
  onTogglePasteTelemetryOpen: () => void;
  pastedTelemetryText: string;
  onChangePastedTelemetryText: (text: string) => void;
  pasteError: string | null;
  onIngestPastedTelemetry: () => void;
  onRunSimulation: (type: 'cpu' | 'disk' | 'dns') => void;
  isSimulating: boolean;
}

export function CollectorInstructionsCard({
  scriptInfo,
  selectedPlatform,
  currentOrigin,
  showScriptCode,
  onToggleShowScriptCode,
  copiedScript,
  onDownloadScript,
  onCopyScript,
  onOneClickPasteClipboard,
  pasteTelemetryOpen,
  onTogglePasteTelemetryOpen,
  pastedTelemetryText,
  onChangePastedTelemetryText,
  pasteError,
  onIngestPastedTelemetry,
  onRunSimulation,
  isSimulating,
}: CollectorInstructionsCardProps): React.ReactElement {
  return (
    <div className="interactive-card collector-card">
      <div className="card-badge">🔬 Read-Only Collector Script</div>
      <p className="text-sm" style={{ color: '#65635f', margin: '4px 0 10px' }}>
        Run the non-elevated diagnostic script on your machine to gather resource metrics, bounded process names, and redacted logs.
      </p>

      {/* Direct script actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button className="button secondary btn-sm" onClick={onDownloadScript}>
          <ArrowDownToLine size={14} />
          Download Script ({scriptInfo?.filename})
        </button>
        <button className="button secondary btn-sm" onClick={onCopyScript}>
          {copiedScript ? <Check size={14} style={{ color: '#166534' }} /> : <Copy size={14} />}
          {copiedScript ? 'Copied to clipboard!' : 'Copy raw script'}
        </button>
        <button
          className="button secondary btn-sm"
          onClick={onToggleShowScriptCode}
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
          <pre
            style={{
              margin: 0,
              padding: '10px',
              background: '#1c1b1a',
              color: '#f5f4f1',
              maxHeight: '220px',
              overflowY: 'auto',
              fontSize: '11px',
              lineHeight: 1.4,
            }}
          >
            {scriptInfo.content}
          </pre>
        </div>
      )}

      {/* Safe Terminal Execution Snippet */}
      <div className="collector-code-block">
        <code>{getCollectorTerminalSnippet(selectedPlatform, currentOrigin)}</code>
      </div>

      {/* 1-Click Clipboard Paste & Ingestion */}
      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #ede9e3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#38332d' }}>
            Ran the script in your terminal?
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="button primary btn-sm"
              onClick={onOneClickPasteClipboard}
              style={{ background: '#252525' }}
            >
              <ClipboardPaste size={14} />
              1-Click Paste from Clipboard
            </button>
            <button
              className="button secondary btn-sm"
              onClick={onTogglePasteTelemetryOpen}
            >
              {pasteTelemetryOpen ? 'Hide Manual Input' : 'Manual Paste'}
            </button>
          </div>
        </div>

        {pasteTelemetryOpen && (
          <div style={{ marginTop: '10px' }}>
            <textarea
              rows={4}
              className="chat-input"
              style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}
              placeholder='Paste the { "schemaVersion": 1, ... } JSON output here...'
              value={pastedTelemetryText}
              onChange={(e) => onChangePastedTelemetryText(e.target.value)}
            />
            {pasteError && (
              <div style={{ color: '#b91c1c', fontSize: '11px', marginTop: '4px' }}>
                {pasteError}
              </div>
            )}
            <div style={{ marginTop: '8px' }}>
              <button
                className="button primary btn-sm"
                onClick={onIngestPastedTelemetry}
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
            onClick={() => onRunSimulation('cpu')}
            disabled={isSimulating}
          >
            <Cpu size={13} />
            {isSimulating ? 'Simulating...' : 'Simulate High CPU'}
          </button>
          <button
            className="button secondary btn-sm"
            onClick={() => onRunSimulation('disk')}
            disabled={isSimulating}
          >
            <HardDrive size={13} />
            Simulate Low Disk
          </button>
          <button
            className="button secondary btn-sm"
            onClick={() => onRunSimulation('dns')}
            disabled={isSimulating}
          >
            <Wifi size={13} />
            Simulate DNS Fault
          </button>
        </div>
      </div>
    </div>
  );
}
