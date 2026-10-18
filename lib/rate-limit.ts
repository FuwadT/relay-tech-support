/**
 * Sliding-window rate limiter (in-memory, per-isolate).
 *
 * Protects AI triage and telemetry ingestion endpoints from abuse.
 * State is per-isolate — resets on Worker cold start. For cross-isolate
 * coordination, replace with a Cloudflare Durable Object or KV counter.
 *
 * Default limits (enforced at call sites):
 *  - POST /api/ai/triage         → 20 requests / 60 s per client IP
 *  - POST /api/cases/[id]/telemetry → 10 requests / 60 s per caseId
 */

export interface RateLimitOptions {
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Maximum number of allowed requests within the window. */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (0 when denied). */
  remaining: number;
  /** Epoch ms at which the oldest request in the window expires. */
  resetAt: number;
}

/** Pluggable store adapter for distributed or isolate-local storage. */
export interface RateLimitStore {
  get(key: string): number[] | null | undefined;
  put(key: string, timestamps: number[], ttlMs: number): void;
}

const MAX_RATE_LIMIT_KEYS = 10_000;

/** Per-key sliding window: timestamps of recent requests (bounded LRU cap). */
const _windows = new Map<string, number[]>();

function enforceStoreCap(): void {
  if (_windows.size >= MAX_RATE_LIMIT_KEYS) {
    // Evict oldest 10% entries to prevent memory exhaustion under high key churn
    const evictCount = Math.floor(MAX_RATE_LIMIT_KEYS * 0.1) || 1;
    const keys = Array.from(_windows.keys()).slice(0, evictCount);
    for (const k of keys) {
      _windows.delete(k);
    }
  }
}

/**
 * Checks whether the given key is within its rate limit.
 * Call this before processing the request; it records the attempt internally.
 *
 * @param key      Unique identifier for the rate-limit bucket (e.g. IP or caseId).
 * @param opts     Window size and request cap.
 * @param store    Optional custom storage adapter (e.g., KV, D1, or isolate memory).
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  store?: RateLimitStore,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  // Retrieve or initialize the sliding window for this key
  let timestamps = store ? (store.get(key) ?? []) : (_windows.get(key) ?? []);

  // Evict timestamps outside the current window
  timestamps = timestamps.filter((t) => t > cutoff);

  const resetAt = timestamps.length > 0 ? timestamps[0] + opts.windowMs : now + opts.windowMs;

  if (timestamps.length >= opts.maxRequests) {
    // Do NOT record the denied attempt — only successful passes count
    if (store) {
      store.put(key, timestamps, opts.windowMs);
    } else {
      _windows.set(key, timestamps);
    }
    return { allowed: false, remaining: 0, resetAt };
  }

  // Record this allowed attempt
  timestamps.push(now);
  if (store) {
    store.put(key, timestamps, opts.windowMs);
  } else {
    enforceStoreCap();
    _windows.set(key, timestamps);
  }

  return {
    allowed: true,
    remaining: opts.maxRequests - timestamps.length,
    resetAt,
  };
}

/**
 * Builds a 429 Too Many Requests response with standard rate-limit headers.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
  return Response.json(
    { ok: false, error: 'Too many requests. Please wait before retrying.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfterSec)),
        'X-RateLimit-Reset': String(result.resetAt),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  );
}
