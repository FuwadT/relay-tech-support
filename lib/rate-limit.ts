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

/** Per-key sliding window: timestamps of recent requests. */
const _windows = new Map<string, number[]>();

/**
 * Checks whether the given key is within its rate limit.
 * Call this before processing the request; it records the attempt internally.
 *
 * @param key      Unique identifier for the rate-limit bucket (e.g. IP or caseId).
 * @param opts     Window size and request cap.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  // Retrieve or initialize the sliding window for this key
  let timestamps = _windows.get(key) ?? [];

  // Evict timestamps outside the current window
  timestamps = timestamps.filter((t) => t > cutoff);

  const resetAt = timestamps.length > 0 ? timestamps[0] + opts.windowMs : now + opts.windowMs;

  if (timestamps.length >= opts.maxRequests) {
    // Do NOT record the denied attempt — only successful passes count
    _windows.set(key, timestamps);
    return { allowed: false, remaining: 0, resetAt };
  }

  // Record this allowed attempt
  timestamps.push(now);
  _windows.set(key, timestamps);

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
