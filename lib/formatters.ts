/**
 * Shared formatting utilities for Relay diagnostic UI.
 * Single source of truth for platform detection and telemetry metric display strings.
 * Import these instead of re-implementing locally in component files.
 */
import type { DevicePlatform } from './enterprise/contracts';

/**
 * Detects the client workstation operating system from the browser user agent.
 * Falls back to 'windows' in non-browser (SSR) environments.
 */
export function detectClientPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux') || ua.includes('ubuntu')) return 'ubuntu';
  return 'windows';
}

/** Safe CPU usage formatter avoiding bare '%' when unsampled or NaN. */
export function formatCpuUsage(cpuPercent?: number | null): string {
  if (typeof cpuPercent !== 'number' || Number.isNaN(cpuPercent)) {
    return 'Not sampled';
  }
  return `${Math.round(cpuPercent)}%`;
}

/** Safe memory formatter with clean percentages and rounded GB values. */
export function formatMemoryUsage(usedMb?: number | null, totalMb?: number | null): string {
  if (typeof usedMb !== 'number' || typeof totalMb !== 'number' || totalMb <= 0) {
    return 'Not sampled';
  }
  const pct = Math.round((usedMb / totalMb) * 100);
  const usedGb = (usedMb / 1024).toFixed(1);
  const totalGbStr = (totalMb / 1024).toFixed(1);
  return `${pct}% (${usedGb} / ${totalGbStr} GB)`;
}

/** Safe disk space formatter with rounded GB and percentage free. */
export function formatDiskFree(freeGb?: number | null, totalGb?: number | null): string {
  if (typeof freeGb !== 'number' || typeof totalGb !== 'number' || totalGb <= 0) {
    return 'Not sampled';
  }
  const freePct = Math.round((freeGb / totalGb) * 100);
  return `${freePct}% free (${Math.round(freeGb)} / ${Math.round(totalGb)} GB)`;
}
