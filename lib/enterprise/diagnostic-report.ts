/**
 * Enterprise Standalone Diagnostic Report Generator.
 *
 * Implements Task E5-02:
 * - Standalone, single-file HTML document for offline viewing
 * - Zero external CDN dependencies (fonts, styles, scripts)
 * - Strict HTML escaping on all device-reported and user-provided strings
 * - Clear epistemological separation: Observations vs Hypotheses
 * - Explicit provenance: 'device_reported_unverified' with source tag
 * - Synthetic telemetry clearly badged
 * - 30-day retention notice
 */

import type {
  DevicePlatform,
  EnterpriseCase,
  EvidenceFinding,
  EvidenceSource,
  TelemetrySnapshot,
} from './contracts';

/**
 * Escapes characters that have special meaning in HTML to prevent XSS.
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe == null) return '';
  return String(unsafe)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export interface EnterpriseReportOptions {
  generatedAt?: string;
  technicianNotes?: string;
}

/**
 * Formats a nullable numeric reading with its unit.
 */
function formatReading(value: number | null | undefined, unit: string): string {
  if (value == null) return 'Unavailable';
  return `${value} ${unit}`;
}

/**
 * Builds a standalone, self-contained HTML diagnostic artifact.
 */
export function buildEnterpriseReportHtml(
  caseRecord: EnterpriseCase,
  snapshot?: TelemetrySnapshot | null,
  findings?: EvidenceFinding[] | null,
  options?: EnterpriseReportOptions,
): string {
  const generatedAt = options?.generatedAt || new Date().toISOString();
  const isSynthetic = snapshot?.source === 'synthetic';
  const platformLabel: Record<DevicePlatform, string> = {
    windows: 'Windows 11',
    macos: 'macOS (Apple Silicon)',
    ubuntu: 'Ubuntu Linux',
  };

  const safeTitle = escapeHtml(caseRecord.title);
  const safeDesc = escapeHtml(caseRecord.description);
  const safeCaseId = escapeHtml(caseRecord.id);
  const safeOrgId = escapeHtml(caseRecord.organizationId);
  const safeStatus = escapeHtml(caseRecord.status);
  const safePlatform = escapeHtml(platformLabel[caseRecord.platform] || caseRecord.platform);
  const safeRequesterId = escapeHtml(caseRecord.requesterId);
  const safeNotes = options?.technicianNotes ? escapeHtml(options.technicianNotes) : null;

  // Telemetry metric formatting
  const cpuText = snapshot?.cpuPercent != null ? `${snapshot.cpuPercent.toFixed(1)}%` : 'Unavailable';
  const memTotal = snapshot?.memoryTotalMb != null ? `${Math.round(snapshot.memoryTotalMb / 1024)} GB` : 'Unavailable';
  const memUsed = snapshot?.memoryUsedMb != null ? `${Math.round(snapshot.memoryUsedMb / 1024)} GB` : 'Unavailable';
  const diskTotal = snapshot?.diskTotalGb != null ? `${snapshot.diskTotalGb} GB` : 'Unavailable';
  const diskFree = snapshot?.diskFreeGb != null ? `${snapshot.diskFreeGb} GB` : 'Unavailable';
  const dnsStatus = snapshot?.dnsResolved == null ? 'Unavailable' : snapshot.dnsResolved ? 'Resolving OK' : 'Failed';
  const pingStatus = snapshot?.gatewayLatencyMs != null ? `${snapshot.gatewayLatencyMs} ms` : 'Unavailable';

  // Process rows
  const processRows = (snapshot?.processes || [])
    .map(
      (p) => `
      <tr>
        <td class="mono">${escapeHtml(String(p.pid))}</td>
        <td class="bold">${escapeHtml(p.name)}</td>
        <td class="mono">${p.cpuPercent != null ? `${p.cpuPercent.toFixed(1)}%` : '—'}</td>
        <td class="mono">${p.memoryMb != null ? `${p.memoryMb} MB` : '—'}</td>
      </tr>`,
    )
    .join('');

  // Findings list
  const findingsHtml = (findings || []).map((f) => {
    const safeSev = escapeHtml(f.severity);
    const safeObs = escapeHtml(f.observation);
    const safeHyp = f.hypothesis ? escapeHtml(f.hypothesis) : null;
    const badgeClass = f.severity === 'critical' ? 'badge-critical' : f.severity === 'warning' ? 'badge-warning' : 'badge-info';

    return `
      <div class="finding-card ${badgeClass}">
        <div class="finding-header">
          <span class="badge ${badgeClass}">${safeSev.toUpperCase()}</span>
          <span class="finding-id mono">${escapeHtml(f.id)}</span>
          <span class="text-muted text-sm">Rule ${escapeHtml(f.ruleVersion)}</span>
        </div>
        <div class="finding-body">
          <p><strong>Observation (Measured):</strong> ${safeObs}</p>
          ${safeHyp ? `<p class="hypothesis"><strong>Hypothesis (Inference):</strong> ${safeHyp}</p>` : ''}
          ${f.recommendedCheckIds && f.recommendedCheckIds.length > 0 ? `
            <div class="follow-up">
              <span class="text-sm bold">Recommended Follow-up Checks:</span>
              <ul>
                ${f.recommendedCheckIds.map((c) => `<li><code>${escapeHtml(c)}</code></li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Relay Diagnostic Report — ${safeCaseId}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --accent: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 960px; margin: 0 auto; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand { font-size: 20px; font-weight: 700; color: #60a5fa; letter-spacing: -0.5px; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-primary { background: #1e3a8a; color: #93c5fd; }
    .badge-synthetic { background: #581c87; color: #d8b4fe; border: 1px dashed #a855f7; }
    .badge-verified { background: #064e3b; color: #6ee7b7; }
    .badge-critical { background: #7f1d1d; color: #fca5a5; }
    .badge-warning { background: #78350f; color: #fcd34d; }
    .badge-info { background: #1e293b; color: #94a3b8; }
    h1 { font-size: 24px; margin-bottom: 6px; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 16px;
      background: var(--card-bg);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .meta-item label { display: block; font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px; }
    .meta-item span { font-weight: 600; font-size: 14px; }
    .section { margin-bottom: 28px; }
    h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; color: #93c5fd; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .metric-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
    }
    .card label { font-size: 12px; color: var(--text-muted); }
    .card .val { font-size: 22px; font-weight: 700; margin-top: 4px; font-family: var(--mono); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .mono { font-family: var(--mono); }
    .bold { font-weight: 600; }
    .text-muted { color: var(--text-muted); }
    .text-sm { font-size: 12px; }
    .finding-card {
      background: var(--card-bg);
      border-left: 4px solid var(--border);
      border-radius: 0 6px 6px 0;
      padding: 14px;
      margin-bottom: 12px;
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .finding-card.badge-critical { border-left-color: var(--danger); }
    .finding-card.badge-warning { border-left-color: var(--warning); }
    .finding-card.badge-info { border-left-color: var(--primary); }
    .finding-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .finding-body p { margin-bottom: 6px; font-size: 14px; }
    .hypothesis { color: #fef08a; font-style: italic; }
    .follow-up { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
    .follow-up ul { margin-left: 20px; margin-top: 4px; }
    .notice {
      background: #1e1b4b;
      border: 1px solid #4338ca;
      color: #c7d2fe;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 20px;
    }
    footer {
      border-top: 1px solid var(--border);
      padding-top: 16px;
      margin-top: 32px;
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <span class="brand">⚡ Relay Enterprise Diagnostic Report</span>
        <div class="badges">
          <span class="badge badge-primary">${safePlatform}</span>
          ${isSynthetic ? '<span class="badge badge-synthetic">⚠ Synthetic Simulation</span>' : '<span class="badge badge-verified">Device-Reported Telemetry</span>'}
          <span class="badge badge-info">Status: ${safeStatus}</span>
        </div>
      </div>
      <h1>${safeTitle}</h1>
      <p class="text-muted">${safeDesc}</p>

      <div class="meta-grid">
        <div class="meta-item"><label>Case ID</label><span class="mono">${safeCaseId}</span></div>
        <div class="meta-item"><label>Organization</label><span class="mono">${safeOrgId}</span></div>
        <div class="meta-item"><label>Requester</label><span>${safeRequesterId}</span></div>
        <div class="meta-item"><label>Generated</label><span class="mono">${escapeHtml(generatedAt)}</span></div>
      </div>
    </header>

    ${isSynthetic ? `
    <div class="notice">
      <strong>NOTICE: Synthetic Data Fixture.</strong> This report was generated from a synthetic telemetry fixture for evaluation purposes. It does not represent verified physical hardware evidence.
    </div>
    ` : ''}

    <div class="section">
      <h2>System Telemetry Summary (Read-Only Inspection)</h2>
      <div class="metric-cards">
        <div class="card">
          <label>CPU Utilization (Avg)</label>
          <div class="val">${cpuText}</div>
        </div>
        <div class="card">
          <label>Memory Used / Total</label>
          <div class="val">${memUsed} <span class="text-sm text-muted">/ ${memTotal}</span></div>
        </div>
        <div class="card">
          <label>Disk Free / Total</label>
          <div class="val">${diskFree} <span class="text-sm text-muted">/ ${diskTotal}</span></div>
        </div>
        <div class="card">
          <label>DNS Resolution</label>
          <div class="val">${dnsStatus}</div>
        </div>
        <div class="card">
          <label>Gateway Latency</label>
          <div class="val">${pingStatus}</div>
        </div>
      </div>
    </div>

    ${processRows ? `
    <div class="section">
      <h2>Top Processes (Bounded Sampling)</h2>
      <p class="text-muted text-sm" style="margin-bottom: 8px;">Process names and memory only. Full command lines and environment variables are excluded to prevent credential capture.</p>
      <table>
        <thead>
          <tr>
            <th>PID</th>
            <th>Process Name</th>
            <th>CPU %</th>
            <th>Memory</th>
          </tr>
        </thead>
        <tbody>
          ${processRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${findingsHtml ? `
    <div class="section">
      <h2>Evidence-Based Findings</h2>
      <p class="text-muted text-sm" style="margin-bottom: 12px;">Factual observations are separated from hypotheses. A single snapshot does not establish confirmed causation.</p>
      ${findingsHtml}
    </div>
    ` : ''}

    ${safeNotes ? `
    <div class="section">
      <h2>Technician Notes (Internal Handoff)</h2>
      <div class="card">
        <p style="white-space: pre-wrap;">${safeNotes}</p>
      </div>
    </div>
    ` : ''}

    <footer>
      <span>Relay Enterprise Triage Platform · Retention: 30 days · Epistemics: Observations separated from hypotheses</span>
      <span>Provenance: device_reported_unverified</span>
    </footer>
  </div>
</body>
</html>`;
}
