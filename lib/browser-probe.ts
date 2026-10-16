/**
 * Zero-Install Browser WebAPI Diagnostic Probe.
 *
 * Captures non-intrusive client-side hardware, network, storage, and graphics
 * metrics in < 1.5 seconds with ZERO downloads and ZERO terminal commands.
 */

export interface BrowserDiagnosticProbeResult {
  collectedAt: string;
  platform: 'windows11' | 'macos' | 'ubuntu';
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  network: {
    online: boolean;
    effectiveType: string | null;
    downlinkMbps: number | null;
    rttMs: number | null;
  };
  timing: {
    dnsLookupMs: number | null;
    tcpConnectMs: number | null;
    ttfbMs: number | null;
    apiPingMs: number | null;
  };
  storage: {
    quotaGb: number | null;
    usageGb: number | null;
    freePercent: number | null;
  };
  gpuRenderer: string | null;
}

export interface BrowserProbeAnalysis {
  isHealthy: boolean;
  observations: string[];
  hypotheses: string[];
  potentialSoftwareRendering: boolean;
}

/**
 * Detects the client platform from browser navigator properties.
 */
function detectBrowserPlatform(): 'windows11' | 'macos' | 'ubuntu' {
  if (typeof navigator === 'undefined') return 'windows11';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac') || ua.includes('darwin')) return 'macos';
  if (ua.includes('linux') || ua.includes('ubuntu')) return 'ubuntu';
  return 'windows11';
}

/**
 * Safely inspects the WebGL unmasked renderer string using an offscreen canvas.
 * Flags software rasterizers (SwiftShader, llvmpipe) that cause CPU spikes during video calls.
 */
function queryGpuRenderer(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' ? renderer : null;
  } catch {
    return null;
  }
}

/**
 * Executes a live zero-install browser WebAPI probe in < 1.5 seconds.
 */
export async function runBrowserDiagnosticProbe(
  platformHint?: 'windows11' | 'macos' | 'ubuntu',
): Promise<BrowserDiagnosticProbeResult> {
  const collectedAt = new Date().toISOString();
  const platform = platformHint || detectBrowserPlatform();

  const hardwareConcurrency = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null;

  const deviceMemoryGb = typeof navigator !== 'undefined' && typeof (navigator as unknown as { deviceMemory?: number }).deviceMemory === 'number'
    ? (navigator as unknown as { deviceMemory: number }).deviceMemory
    : null;

  // Network connection inspection
  const conn = typeof navigator !== 'undefined' && 'connection' in navigator
    ? (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
    : undefined;

  const online = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;

  const effectiveType = conn?.effectiveType ?? null;
  const downlinkMbps = typeof conn?.downlink === 'number' ? conn.downlink : null;
  const rttMs = typeof conn?.rtt === 'number' ? conn.rtt : null;

  // Measure live API ping roundtrip
  let apiPingMs: number | null = null;
  try {
    const pingStart = performance.now();
    const res = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      apiPingMs = Math.round(performance.now() - pingStart);
    }
  } catch {
    apiPingMs = null;
  }

  // Navigation timing for DNS and TCP connect
  let dnsLookupMs: number | null = null;
  let tcpConnectMs: number | null = null;
  let ttfbMs: number | null = null;

  try {
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        if (nav.domainLookupEnd > nav.domainLookupStart) {
          dnsLookupMs = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
        }
        if (nav.connectEnd > nav.connectStart) {
          tcpConnectMs = Math.round(nav.connectEnd - nav.connectStart);
        }
        if (nav.responseStart > nav.requestStart) {
          ttfbMs = Math.round(nav.responseStart - nav.requestStart);
        }
      }
    }
  } catch {
    // Navigation timing unavailable
  }

  // Storage estimation
  let quotaGb: number | null = null;
  let usageGb: number | null = null;
  let freePercent: number | null = null;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.quota === 'number' && estimate.quota > 0) {
        quotaGb = Number((estimate.quota / (1024 * 1024 * 1024)).toFixed(2));
        usageGb = typeof estimate.usage === 'number'
          ? Number((estimate.usage / (1024 * 1024 * 1024)).toFixed(2))
          : 0;
        freePercent = Math.round(((estimate.quota - (estimate.usage || 0)) / estimate.quota) * 100);
      }
    }
  } catch {
    // Storage estimation unavailable
  }

  const gpuRenderer = queryGpuRenderer();

  return {
    collectedAt,
    platform,
    hardwareConcurrency,
    deviceMemoryGb,
    network: {
      online,
      effectiveType,
      downlinkMbps,
      rttMs,
    },
    timing: {
      dnsLookupMs,
      tcpConnectMs,
      ttfbMs,
      apiPingMs,
    },
    storage: {
      quotaGb,
      usageGb,
      freePercent,
    },
    gpuRenderer,
  };
}

/**
 * Analyzes browser probe results to extract actionable diagnostic findings.
 */
export function analyzeBrowserProbe(probe: BrowserDiagnosticProbeResult): BrowserProbeAnalysis {
  const observations: string[] = [];
  const hypotheses: string[] = [];
  let isHealthy = true;

  // 1. GPU Software Rendering Check
  const renderer = probe.gpuRenderer?.toLowerCase() || '';
  const isSoftwareRenderer = /swiftshader|llvmpipe|software rasterizer|basic render|gdi generic/i.test(renderer);

  if (isSoftwareRenderer) {
    isHealthy = false;
    observations.push(`GPU Hardware Acceleration disabled (Active renderer: "${probe.gpuRenderer}"). WebGL and video streams fall back to CPU emulation.`);
    hypotheses.push('Software rasterization forces CPU rendering, which directly causes high fan noise, thermal throttling, and browser UI freezes during media playback or calls.');
  } else if (probe.gpuRenderer) {
    observations.push(`GPU Hardware Acceleration active (${probe.gpuRenderer}).`);
  }

  // 2. Hardware Capacity
  if (probe.hardwareConcurrency !== null) {
    observations.push(`Logical processor cores: ${probe.hardwareConcurrency}.`);
    if (probe.hardwareConcurrency <= 2) {
      isHealthy = false;
      hypotheses.push('System has low core capacity (<= 2 logical cores), making it prone to saturation from multi-threaded web applications.');
    }
  }

  if (probe.deviceMemoryGb !== null) {
    observations.push(`Device memory estimate: ${probe.deviceMemoryGb} GB.`);
    if (probe.deviceMemoryGb <= 4) {
      isHealthy = false;
      hypotheses.push('Device has 4 GB or less memory, risking excessive page swapping when multiple browser tabs are open.');
    }
  }

  // 3. Network and API latency
  if (!probe.network.online) {
    isHealthy = false;
    observations.push('Browser reports offline status (navigator.onLine is false).');
    hypotheses.push('Network interface disconnected or gateway unreachable.');
  } else {
    if (probe.timing.apiPingMs !== null) {
      observations.push(`Server API round-trip latency: ${probe.timing.apiPingMs} ms.`);
      if (probe.timing.apiPingMs > 600) {
        isHealthy = false;
        hypotheses.push('High server round-trip latency indicates network congestion or bufferbloat.');
      }
    }

    if (probe.network.rttMs !== null && probe.network.rttMs > 300) {
      isHealthy = false;
      observations.push(`Cellular/Wi-Fi connection RTT: ${probe.network.rttMs} ms.`);
      hypotheses.push('Elevated connection round-trip time indicates wireless interference or packet loss.');
    }
  }

  // 4. Storage quota
  if (probe.storage.freePercent !== null && probe.storage.freePercent < 10) {
    isHealthy = false;
    observations.push(`Browser origin storage nearly full (${probe.storage.freePercent}% remaining of ${probe.storage.quotaGb} GB).`);
    hypotheses.push('Insufficient origin storage quota may prevent local caching and indexedDB operations.');
  }

  return {
    isHealthy,
    observations,
    hypotheses,
    potentialSoftwareRendering: isSoftwareRenderer,
  };
}
