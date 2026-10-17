'use client';

import React from 'react';
import { ArrowDownToLine } from 'lucide-react';
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
import { getCatalogAction } from '@/lib/enterprise/remediation-catalog';

export interface TelemetryFindingsCardProps {
  findings: EvidenceFinding[];
  activeSnapshot: TelemetrySnapshot | null;
  remediation?: RemediationProposal;
  onDownloadReport: () => void;
}

export function TelemetryFindingsCard({
  findings,
  activeSnapshot,
  remediation,
  onDownloadReport,
}: TelemetryFindingsCardProps): React.ReactElement {
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
            <div style={{ fontSize: '11px', color: '#76736d' }}>
              <strong>Rollback strategy:</strong> {remediation.rollbackInstructions.join('; ')}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
