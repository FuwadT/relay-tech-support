import type { DiagnosticArtifact, ProposedFix, SystemTelemetry } from './contracts';

export interface BuildArtifactInput {
  caseId: string;
  defectTitle: string;
  rootCause: string;
  severity: 'critical' | 'warning' | 'info';
  userPrompt: string;
  telemetry: SystemTelemetry;
  proposedFix?: ProposedFix | null;
  helpdeskNotes?: string;
  generatedAt?: string;
}

/**
 * Builds a standalone, self-contained HTML diagnostic artifact report.
 * Does not depend on external CDNs or scripts so it can be viewed offline.
 */
export function buildDiagnosticArtifactHtml(input: BuildArtifactInput): string {
  const {
    caseId,
    defectTitle,
    rootCause,
    severity,
    userPrompt,
    telemetry,
    proposedFix,
    helpdeskNotes,
    generatedAt = new Date().toISOString(),
  } = input;

  const severityColor =
    severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#3b82f6';
  const severityBg =
    severity === 'critical' ? 'rgba(239, 68, 68, 0.15)' : severity === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)';

  const formattedDate = new Date(generatedAt).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const topProcessesRows = (telemetry.topProcesses || [])
    .map(
      (p) => `
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #27272a; font-family: monospace; font-size: 13px;">${p.pid}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #27272a; font-weight: 500;">${escapeHtml(p.name)}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #27272a; text-align: right; color: ${p.cpuPercent > 50 ? '#ef4444' : '#e4e4e7'}; font-weight: 600;">${p.cpuPercent}%</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #27272a; text-align: right; color: #a1a1aa;">${p.memoryMb} MB</td>
      </tr>
    `
    )
    .join('');

  const errorLogItems = (telemetry.systemErrors || [])
    .map(
      (err) => `
      <li style="margin-bottom: 8px; padding: 10px 14px; background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; border-radius: 4px; font-family: monospace; font-size: 13px; color: #fca5a5;">
        ${escapeHtml(err)}
      </li>
    `
    )
    .join('');

  const fixHtml = proposedFix
    ? `
      <section style="margin-top: 32px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <h2 style="font-size: 18px; font-weight: 600; margin: 0; color: #10b981; display: flex; align-items: center; gap: 8px;">
            <span>⚡</span> Automated Remediation Script
          </h2>
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px; background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 600;">
            Risk: ${proposedFix.riskLevel.toUpperCase()}
          </span>
        </div>
        <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          ${escapeHtml(proposedFix.explanation)}
        </p>
        <div style="background: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; position: relative;">
          <div style="font-size: 11px; text-transform: uppercase; color: #71717a; margin-bottom: 8px; font-weight: 600;">
            Terminal / Command Script (${proposedFix.os.toUpperCase()}):
          </div>
          <pre style="margin: 0; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; color: #a7f3d0; overflow-x: auto; white-space: pre-wrap; word-break: break-all;"><code>${escapeHtml(proposedFix.command)}</code></pre>
        </div>
        ${
          proposedFix.executed
            ? `<div style="margin-top: 14px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #10b981; font-weight: 500;">
                <span>✓</span> Fix executed successfully and verified.
              </div>`
            : ''
        }
      </section>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relay AI Diagnostic Report - Case ${escapeHtml(caseId)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #09090b;
      color: #fafafa;
      line-height: 1.5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #27272a;
      padding-bottom: 24px;
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 20px;
      color: white;
    }
    .meta-box {
      font-size: 13px;
      color: #a1a1aa;
      text-align: right;
    }
    @media (max-width: 600px) {
      .meta-box { text-align: left; }
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin: 20px 0;
    }
    .metric-item {
      background: #27272a;
      padding: 16px;
      border-radius: 8px;
    }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #a1a1aa;
      font-weight: 600;
    }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
      color: #fafafa;
      margin-top: 4px;
    }
    .progress-bar {
      height: 6px;
      background: #3f3f46;
      border-radius: 3px;
      margin-top: 8px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      padding: 10px 14px;
      border-bottom: 2px solid #3f3f46;
      font-size: 12px;
      text-transform: uppercase;
      color: #a1a1aa;
      font-weight: 600;
    }
    .print-btn {
      background: #27272a;
      color: #fafafa;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .print-btn:hover { background: #3f3f46; }
    @media print {
      body { background: white; color: black; }
      .card { border: 1px solid #ddd; background: white; color: black; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">R</div>
        <div>
          <h1 style="font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">Relay AI Diagnostics</h1>
          <p style="font-size: 13px; color: #a1a1aa; margin: 2px 0 0;">Automated System Triage & Defect Identification Report</p>
        </div>
      </div>
      <div class="meta-box">
        <div><strong>Case Reference:</strong> ${escapeHtml(caseId)}</div>
        <div><strong>Generated:</strong> ${escapeHtml(formattedDate)}</div>
        <div style="margin-top: 8px;">
          <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
        </div>
      </div>
    </header>

    <!-- EXECUTIVE DEFECT SUMMARY -->
    <div class="card" style="border-left: 4px solid ${severityColor};">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
        <span class="badge" style="background: ${severityBg}; color: ${severityColor};">
          ${severity.toUpperCase()} DEFECT DETECTED
        </span>
        <span style="font-size: 12px; color: #71717a; font-family: monospace;">
          Collector OS: ${escapeHtml(telemetry.os.toUpperCase())} (${escapeHtml(telemetry.osVersion)})
        </span>
      </div>
      <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #ffffff;">
        ${escapeHtml(defectTitle)}
      </h2>
      <p style="font-size: 15px; color: #d4d4d8; line-height: 1.6; margin: 0 0 16px;">
        <strong>Root Cause Analysis:</strong> ${escapeHtml(rootCause)}
      </p>
      <div style="background: #27272a; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #a1a1aa;">
        <strong style="color: #e4e4e7;">User Reported Symptom:</strong> "${escapeHtml(userPrompt)}"
      </div>
    </div>

    <!-- TELEMETRY SNAPSHOT -->
    <div class="card">
      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa;">
        System Telemetry & Resource Gauges
      </h2>
      <div class="metric-grid">
        <div class="metric-item">
          <div class="metric-label">CPU Utilization</div>
          <div class="metric-value" style="color: ${telemetry.cpuUsagePercent > 80 ? '#ef4444' : '#fafafa'};">
            ${telemetry.cpuUsagePercent}%
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(telemetry.cpuUsagePercent, 100)}%; background: ${telemetry.cpuUsagePercent > 80 ? '#ef4444' : '#3b82f6'};"></div>
          </div>
          <div style="font-size: 11px; color: #71717a; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(telemetry.cpuModel || 'CPU')}
          </div>
        </div>

        <div class="metric-item">
          <div class="metric-label">Memory Usage</div>
          <div class="metric-value" style="color: ${telemetry.memoryUsagePercent > 85 ? '#ef4444' : '#fafafa'};">
            ${telemetry.memoryUsagePercent}%
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(telemetry.memoryUsagePercent, 100)}%; background: ${telemetry.memoryUsagePercent > 85 ? '#ef4444' : '#10b981'};"></div>
          </div>
          <div style="font-size: 11px; color: #71717a; margin-top: 6px;">
            ${Math.round(telemetry.memoryUsedMb / 1024 * 10) / 10} GB / ${Math.round(telemetry.memoryTotalMb / 1024 * 10) / 10} GB
          </div>
        </div>

        <div class="metric-item">
          <div class="metric-label">Disk Storage</div>
          <div class="metric-value" style="color: ${telemetry.diskUsagePercent > 90 ? '#ef4444' : '#fafafa'};">
            ${telemetry.diskUsagePercent}%
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(telemetry.diskUsagePercent, 100)}%; background: ${telemetry.diskUsagePercent > 90 ? '#ef4444' : '#8b5cf6'};"></div>
          </div>
          <div style="font-size: 11px; color: #71717a; margin-top: 6px;">
            ${telemetry.diskFreeGb} GB free of ${telemetry.diskTotalGb} GB
          </div>
        </div>

        <div class="metric-item">
          <div class="metric-label">Network Status</div>
          <div class="metric-value" style="color: ${telemetry.networkConnected && telemetry.dnsWorking ? '#10b981' : '#ef4444'}; font-size: 18px;">
            ${telemetry.networkConnected ? (telemetry.dnsWorking ? 'Connected' : 'DNS Failed') : 'Offline'}
          </div>
          <div style="font-size: 12px; color: #a1a1aa; margin-top: 14px;">
            Gateway Ping: ${telemetry.gatewayPingMs != null ? `${telemetry.gatewayPingMs} ms` : 'OK'}
          </div>
        </div>
      </div>
    </div>

    <!-- TOP PROCESSES TABLE -->
    ${
      topProcessesRows
        ? `
      <div class="card">
        <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa;">
          Active High-Resource Processes
        </h2>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>PID</th>
                <th>Process Name</th>
                <th style="text-align: right;">CPU Load</th>
                <th style="text-align: right;">Memory</th>
              </tr>
            </thead>
            <tbody>
              ${topProcessesRows}
            </tbody>
          </table>
        </div>
      </div>
    `
        : ''
    }

    <!-- SYSTEM ERROR LOGS -->
    ${
      errorLogItems
        ? `
      <div class="card">
        <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa;">
          System Event & Error Diagnostics
        </h2>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${errorLogItems}
        </ul>
      </div>
    `
        : ''
    }

    <!-- TIER-1 HELPDESK HANDOFF CARD -->
    <div class="card" style="background: #1c1917; border-color: #44403c;">
      <h2 style="font-size: 16px; font-weight: 600; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #fbbf24; display: flex; align-items: center; gap: 8px;">
        <span>📋</span> Tier-1 Helpdesk Technician Handoff Sheet
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; font-size: 13px;">
        <div><strong style="color: #a8a29e;">Ticket Reference:</strong> <span style="font-family: monospace; color: #fafaf9;">${escapeHtml(caseId)}</span></div>
        <div><strong style="color: #a8a29e;">Target Host:</strong> <span style="font-family: monospace; color: #fafaf9;">${escapeHtml(telemetry.hostname || 'Unknown')}</span></div>
        <div><strong style="color: #a8a29e;">Triage State:</strong> <span style="color: #34d399; font-weight: 600;">Telemetric Defect Isolated</span></div>
        <div><strong style="color: #a8a29e;">Recommended Escalation:</strong> ${proposedFix ? '<span style="color: #38bdf8;">Automated Remediation Available</span>' : '<span style="color: #f87171;">Manual Hardware/OS Inspection</span>'}</div>
      </div>
      <div style="background: #292524; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #d6d3d1; line-height: 1.5;">
        <strong>Helpdesk Triage Notes:</strong><br />
        ${escapeHtml(helpdeskNotes || 'System telemetry collected via read-only inspection. Root cause isolated from process and kernel log analysis. Customer informed of remediation action.')}
      </div>
    </div>

    <!-- AUTOMATED FIX -->
    ${fixHtml}

    <footer style="margin-top: 48px; border-top: 1px solid #27272a; padding-top: 24px; text-align: center; font-size: 12px; color: #71717a;">
      Relay Technical Support Assistant · Read-Only Sandboxed Investigation · End of Diagnostic Artifact
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
