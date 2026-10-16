/**
 * Tests for Enterprise Diagnostic Report Generator (Task E5-02).
 * Verifies XSS escaping, zero external CDN dependencies, CSP, synthetic badging,
 * and epistemological separation of observations vs hypotheses.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EnterpriseCase, EvidenceFinding, TelemetrySnapshot } from '../lib/enterprise/contracts';
import { buildEnterpriseReportHtml, escapeHtml } from '../lib/enterprise/diagnostic-report';

const mockCase: EnterpriseCase = {
  id: 'c1234567-89ab-cdef-0123-456789abcdef',
  organizationId: 'o1234567-89ab-cdef-0123-456789abcdef',
  requesterId: 'u1234567-89ab-cdef-0123-456789abcdef',
  title: 'Network latency during video calls',
  description: 'Calls drop every 10 minutes when connected to office WiFi.',
  platform: 'windows',
  status: 'investigating',
  createdAt: '2026-10-15T18:00:00.000Z',
  updatedAt: '2026-10-15T18:05:00.000Z',
};

const mockSnapshot: TelemetrySnapshot = {
  schemaVersion: 1,
  collectionId: 'col-001',
  platform: 'windows',
  osVersion: 'Windows 11 Enterprise 23H2',
  architecture: 'x64',
  source: 'collector',
  collectorVersion: '1.0.0',
  collectedAt: '2026-10-15T18:04:00.000Z',
  sampleIntervalMs: 5000,
  cpuPercent: 42.5,
  memoryTotalMb: 16384,
  memoryUsedMb: 8192,
  diskTotalGb: 512,
  diskFreeGb: 128,
  dnsResolved: true,
  gatewayLatencyMs: 14.2,
  processes: [
    { pid: 1044, name: 'teams.exe', cpuPercent: 18.2, memoryMb: 1200 },
    { pid: 2280, name: 'chrome.exe', cpuPercent: 12.1, memoryMb: 850 },
  ],
  eventExcerpts: [
    { eventId: 'NET-101', text: 'WLAN Extensibility Module has stopped.' },
  ],
  errors: [],
};

const mockFindings: EvidenceFinding[] = [
  {
    id: 'f-001',
    severity: 'warning',
    observation: 'Gateway latency average 14.2ms with occasional spike to 180ms.',
    hypothesis: 'Possible 802.11 roaming scan causing transient frame drops.',
    evidenceIds: ['col-001'],
    recommendedCheckIds: ['net_adapter_power_save', 'wlan_channel_congestion'],
    ruleVersion: '1.2.0',
  },
];

describe('E5-02: escapeHtml unit tests', () => {
  it('escapes &, <, >, ", and single quotes', () => {
    assert.strictEqual(
      escapeHtml('<script>alert("XSS & fun")</script>'),
      '&lt;script&gt;alert(&quot;XSS &amp; fun&quot;)&lt;/script&gt;',
    );
    assert.strictEqual(escapeHtml("it's a test"), 'it&#039;s a test');
  });

  it('handles null and undefined gracefully', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });
});

describe('E5-02: buildEnterpriseReportHtml security & offline checks', () => {
  it('contains zero external network URLs (no external stylesheets, fonts, or scripts)', () => {
    const html = buildEnterpriseReportHtml(mockCase, mockSnapshot, mockFindings);

    // Should not contain http:// or https:// links for assets
    const externalAssetRegex = /(?:href|src)=["']https?:\/\//i;
    assert.ok(
      !externalAssetRegex.test(html),
      'Report HTML must not contain external asset URLs (href/src="http(s)://...")',
    );
  });

  it('specifies strict Content-Security-Policy forbidding external assets', () => {
    const html = buildEnterpriseReportHtml(mockCase, mockSnapshot, mockFindings);
    assert.ok(
      html.includes('default-src &#039;none&#039;') || html.includes("default-src 'none'"),
      'Must define default-src none CSP',
    );
  });

  it('escapes malicious XSS payloads in title, description, and process names', () => {
    const maliciousCase: EnterpriseCase = {
      ...mockCase,
      title: '<script>alert("title")</script>',
      description: '"><img src=x onerror=alert(1)>',
    };
    const maliciousSnapshot: TelemetrySnapshot = {
      ...mockSnapshot,
      processes: [
        { pid: 9999, name: '<svg onload=alert("proc")>', cpuPercent: 99, memoryMb: 100 },
      ],
    };

    const html = buildEnterpriseReportHtml(maliciousCase, maliciousSnapshot, mockFindings);

    assert.ok(!html.includes('<script>alert("title")</script>'), 'Script tag in title must be escaped');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;'), 'Title must be HTML-escaped');
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'Img payload in description must be escaped');
    assert.ok(!html.includes('<svg onload='), 'SVG payload in process name must be escaped');
  });

  it('labels synthetic simulation data explicitly', () => {
    const syntheticSnapshot: TelemetrySnapshot = {
      ...mockSnapshot,
      source: 'synthetic',
    };
    const html = buildEnterpriseReportHtml(mockCase, syntheticSnapshot, mockFindings);

    assert.ok(html.includes('Synthetic Simulation'), 'Must include Synthetic badge');
    assert.ok(html.includes('NOTICE: Synthetic Data Fixture'), 'Must include synthetic fixture notice');
  });

  it('separates observations from hypotheses clearly', () => {
    const html = buildEnterpriseReportHtml(mockCase, mockSnapshot, mockFindings);

    assert.ok(html.includes('Observation (Measured):'), 'Must label direct observation');
    assert.ok(html.includes('Hypothesis (Inference):'), 'Must label hypothesis as inference');
    assert.ok(html.includes('Gateway latency average 14.2ms'), 'Includes observation text');
    assert.ok(html.includes('Possible 802.11 roaming scan'), 'Includes hypothesis text');
  });

  it('handles null telemetry readings without NaN or crashing', () => {
    const sparseSnapshot: TelemetrySnapshot = {
      ...mockSnapshot,
      cpuPercent: null,
      memoryTotalMb: null,
      memoryUsedMb: null,
      diskTotalGb: null,
      diskFreeGb: null,
      dnsResolved: null,
      gatewayLatencyMs: null,
      processes: [],
    };

    const html = buildEnterpriseReportHtml(mockCase, sparseSnapshot, []);
    assert.ok(html.includes('Unavailable'), 'Missing readings must render as Unavailable');
    assert.ok(!html.includes('NaN'), 'Must not render NaN');
  });

  it('includes 30-day retention notice and provenance note in footer', () => {
    const html = buildEnterpriseReportHtml(mockCase, mockSnapshot, mockFindings);
    assert.ok(html.includes('Retention: 30 days'), 'Must include 30-day retention notice');
    assert.ok(html.includes('device_reported_unverified'), 'Must include provenance note');
  });
});
