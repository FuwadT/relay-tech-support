/**
 * Telemetry PII Redactor — strips user-identifying data from raw TelemetrySnapshot
 * payloads before persistence. Applied server-side on ingestion.
 *
 * Redaction rules:
 *  - macOS/Linux user paths: /Users/<name>/ → /Users/[REDACTED]/
 *  - Windows user paths:     C:\Users\<name>\ → C:\Users\[REDACTED]\
 *  - Private IPv4 addresses (RFC 1918) → [PRIVATE-IP]
 *  - Private IPv6 addresses (fc00::/7)  → [PRIVATE-IPv6]
 *  - MAC addresses (xx:xx:xx:xx:xx:xx)  → [MAC-REDACTED]
 *  - Bearer tokens / API keys in strings → [KEY-REDACTED]
 */
import type { TelemetrySnapshot } from './enterprise/contracts';

export interface RedactionResult {
  payload: TelemetrySnapshot;
  redactedFieldsCount: number;
}

// Private IPv4 subnets: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
const PRIVATE_IPV4 =
  /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g;

// Private IPv6 (fc00::/7 — starts with fc or fd)
const PRIVATE_IPV6 = /\b(fc|fd)[0-9a-f]{2}:[0-9a-f:]{2,39}\b/gi;

// MAC addresses: 6 colon-separated or hyphen-separated hex octets
const MAC_ADDRESS = /\b([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}\b/gi;

// macOS/Linux paths: /Users/<name>/
const UNIX_USER_PATH = /(\/(?:Users|home)\/)[^/\s"']+(?=\/|$)/g;

// Windows paths: C:\Users\<name>\ (any drive letter, any casing)
const WIN_USER_PATH = /([A-Za-z]:\\[Uu]sers\\)[^\\\s"']+(?=\\|$)/g;

// Bearer tokens, API keys: Bearer <token>, Authorization: <token>, apikey=<value>
const API_KEY_PATTERN =
  /\b(Bearer\s+|api[_-]?key\s*[=:]\s*|Authorization:\s*(?:Bearer\s+)?)[A-Za-z0-9\-._~+/]{20,}/gi;

/**
 * Applies all redaction rules to a single string value.
 * Returns the redacted string and number of substitutions made.
 */
function redactString(value: string): { result: string; count: number } {
  let count = 0;
  let result = value;

  result = result.replace(API_KEY_PATTERN, (match, prefix) => {
    count++;
    return prefix + '[KEY-REDACTED]';
  });
  result = result.replace(UNIX_USER_PATH, (match, prefix) => { count++; return prefix + '[REDACTED]'; });
  result = result.replace(WIN_USER_PATH, (match, prefix) => { count++; return prefix + '[REDACTED]'; });
  result = result.replace(PRIVATE_IPV4, () => { count++; return '[PRIVATE-IP]'; });
  result = result.replace(PRIVATE_IPV6, () => { count++; return '[PRIVATE-IPv6]'; });
  result = result.replace(MAC_ADDRESS, () => { count++; return '[MAC-REDACTED]'; });

  return { result, count };
}

/**
 * Recursively redacts PII from an unknown value (string, array, plain object).
 * Returns the sanitised value and total redaction count.
 */
function redactValue(value: unknown): { result: unknown; count: number } {
  if (typeof value === 'string') {
    const { result, count } = redactString(value);
    return { result, count };
  }
  if (Array.isArray(value)) {
    let total = 0;
    const arr = value.map((item) => {
      const { result, count } = redactValue(item);
      total += count;
      return result;
    });
    return { result: arr, count: total };
  }
  if (value !== null && typeof value === 'object') {
    let total = 0;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const { result, count } = redactValue(v);
      obj[k] = result;
      total += count;
    }
    return { result: obj, count: total };
  }
  return { result: value, count: 0 };
}

/**
 * Redacts PII from a raw TelemetrySnapshot before server-side persistence.
 *
 * Only string fields (process names, command args, error messages) can carry
 * PII — numeric and boolean readings pass through untouched.
 *
 * @returns The sanitised snapshot and the total number of substitutions made.
 */
export function redactTelemetryPayload(raw: TelemetrySnapshot): RedactionResult {
  const { result, count } = redactValue(raw);
  return {
    payload: result as TelemetrySnapshot,
    redactedFieldsCount: count,
  };
}
