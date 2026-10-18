'use client';

import React, { useState } from 'react';
import { ArrowDownToLine, Check, Copy, RotateCw, Sparkles } from 'lucide-react';
import type {
  EvidenceFinding,
  RemediationProposal,
  TelemetrySnapshot,
} from '@/lib/enterprise/contracts';
import {
  formatCpuUsage,
  formatMemoryUsage,
  formatDiskFree,
} from '@/lib/formatters';
import { getCatalogAction, getRemediationCommand } from '@/lib/enterprise/remediation-catalog';
import type { RemediationDiff } from '@/lib/enterprise/findings';

export interface TelemetryFindingsCardProps {
  findings: EvidenceFinding[];
  activeSnapshot: TelemetrySnapshot | null;
  remediation?: RemediationProposal;
  onDownloadReport: () => void;
  onSimulateRemediation?: () => void;
  isSimulatingRemediation?: boolean;
  remediationDiffs?: RemediationDiff[];
  caseId?: string;
}

export function TelemetryFindingsCard({
  findings,
  activeSnapshot,
  remediation,
  onDownloadReport,
  onSimulateRemediation,
  isSimulatingRemediation = false,
  remediationDiffs,
  caseId,
}: TelemetryFindingsCardProps): React.ReactElement {
  const [copiedVerifyCmd, setCopiedVerifyCmd] = useState(false);
  return (
    <div className="interactive-card findings-card">
      <div className="findings-header">
        <h4>Evidence-Linked Telemetry Findings</h4>
        <button className="button secondary btn-xs" onClick={onDownloadReport}>
          <ArrowDownToLine size={13} />
          Export Diagnostic HTML Artifact
        </button>
      </div>

      {/* Telemetry Summary Gauges (Safe Formatting) */}
      {activeSnapshot && (
        <div className="gauge-grid">
          <div className="gauge-item">
            <span className="gauge-label">CPU Usage</span>
            <span className="gauge-val">{formatCpuUsage(activeSnapshot.cpuPercent)}</span>
          </div>
          <div className="gauge-item">
            <span className="gauge-label">Memory Used</span>
            <span className="gauge-val">
              {formatMemoryUsage(activeSnapshot.memoryUsedMb, activeSnapshot.memoryTotalMb)}
            </span>
          </div>
          <div className="gauge-item">
            <span className="gauge-label">Disk Free</span>
            <span className="gauge-val">
              {formatDiskFree(activeSnapshot.diskFreeGb, activeSnapshot.diskTotalGb)}
            </span>
          </div>
          <div className="gauge-item">
            <span className="gauge-label">DNS Status</span>
            <span className="gauge-val">
              {activeSnapshot.dnsResolved === null
                ? 'Not sampled'
                : activeSnapshot.dnsResolved
                  ? 'Healthy'
                  : 'Failed'}
            </span>
          </div>
        </div>
      )}

      {/* Findings List */}
      <div className="findings-list">
        {findings.map((f) => (
          <div key={f.id} className={`finding-item severity-${f.severity}`}>
            <div className="f-title">
              <span className={`badge-sev badge-${f.severity}`}>{f.severity.toUpperCase()}</span>
              <span>{f.id}</span>
            </div>
            <p style={{ margin: '4px 0 2px', color: '#4a4641' }}>{f.observation}</p>
            {f.hypothesis && (
              <div className="f-hyp">
                <em>Hypothesis:</em> {f.hypothesis}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Remediation Proposal Box */}
      {remediation && (() => {
        const actionDef = getCatalogAction(remediation.catalogActionId, remediation.platform);
        const scriptPreview = actionDef ? actionDef.renderScript(remediation.parameters) : null;
        return (
          <div className="remediation-box">
            <h5>
              Recommended Catalog Action: <code>{remediation.catalogActionId}</code> (v{remediation.catalogVersion})
            </h5>
            {actionDef && (
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1c1b1a', margin: '4px 0 2px' }}>
                {actionDef.title}
              </p>
            )}
            {actionDef && (
              <p style={{ fontSize: '12px', color: '#4a4641', margin: '2px 0 8px' }}>
                {actionDef.description}
              </p>
            )}
            {scriptPreview && (
              <div
                style={{
                  background: '#1c1b1a',
                  color: '#f5f4f1',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  marginBottom: '8px',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {scriptPreview}
              </div>
            )}
            <p style={{ fontSize: '12px', color: '#4a4641', margin: '4px 0 8px' }}>
              <strong>Consequences:</strong> {remediation.consequences.join('; ')}
            </p>
            <div style={{ fontSize: '11px', color: '#76736d', marginBottom: '10px' }}>
              <strong>Rollback strategy:</strong> {remediation.rollbackInstructions.join('; ')}
            </div>

            {/* Closed-loop execution and auto-verify controls */}
            {(() => {
              const cmd = getRemediationCommand(remediation.catalogActionId, remediation.platform) || (remediation.platform === 'windows' ? 'ipconfig /flushdns' : 'dscacheutil -flushcache');
              const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
              const verifyUrl = `${origin}/api/cases/${caseId || 'active'}/telemetry`;
              const autoVerifySnippet = remediation.platform === 'windows'
                ? `$env:RELAY_CALLBACK_URL="${verifyUrl}"; $env:RELAY_AUTO_VERIFY="1"; ${cmd}; irm ${origin}/api/collectors/windows11.ps1 | iex`
                : `RELAY_CALLBACK_URL="${verifyUrl}" RELAY_AUTO_VERIFY="1" ${cmd}`;

              return (
                <div className="remediation-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="button primary btn-xs"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(autoVerifySnippet).catch(() => {});
                        setCopiedVerifyCmd(true);
                        setTimeout(() => setCopiedVerifyCmd(false), 2000);
                      }
                    }}
                  >
                    {copiedVerifyCmd ? <Check size={13} /> : <Copy size={13} />}
                    {copiedVerifyCmd ? 'Copied Command!' : 'Copy Remediation & Auto-Verify Command'}
                  </button>

                  {onSimulateRemediation && (
                    <button
                      type="button"
                      className="button secondary btn-xs"
                      onClick={onSimulateRemediation}
                      disabled={isSimulatingRemediation}
                    >
                      {isSimulatingRemediation ? (
                        <RotateCw size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      Simulate Verification in Browser (Demo)
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Before vs After Delta Verification Badges */}
            {remediationDiffs && remediationDiffs.length > 0 && (
              <div
                className="delta-verification-box"
                style={{
                  marginTop: '10px',
                  padding: '8px 10px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '4px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#166534', marginBottom: '4px' }}>
                  🎯 Remediation Closed-Loop Delta Verification:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {remediationDiffs.map((d, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: d.improved ? '#dcfce7' : '#fef9c3',
                        color: d.improved ? '#15803d' : '#854d0e',
                        border: `1px solid ${d.improved ? '#86efac' : '#fde047'}`,
                      }}
                    >
                      {d.badge}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
