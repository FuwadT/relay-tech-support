# Relay Tech Support — Phase 3 Sprint Plan
## Reliability, Scalability & Clean Code

**Baseline Commit:** `eca5625e26aebcad1270ae7dcd2519a9cdfcd4b9`

**Sprint Pillars:**
1. **Clean Code & Modularity** — DRY shared utilities, monolith decomposition, dead-code removal
2. **Edge Reliability & Fault Tolerance** — LLM circuit breakers, bounded telemetry ingestion, closed-loop remediation verification
3. **Cloudflare D1 & Worker Scalability** — Composite SQLite indexing, idempotent reservation TTL sweeping, pagination, rate limiting

**Success Criteria:** All of the following must pass before shipping:
```bash
node scripts/test-backend.mjs
node tests/enterprise-runtime.mjs
bash scripts/build-verified.sh
```

---

## Pillar 1 — Clean Code & Architectural Modularity

### 1.1 Extract Shared UI & Formatting Utilities

**Problem:** `components/enterprise-chat-view.tsx` and `components/tech-support-app.tsx` duplicate helper logic for client OS detection (`detectClientPlatform`), inline Markdown bold/code parsing (`renderFormattedMessage`), and telemetry metric formatting (`formatCpuUsage`, `formatMemoryUsage`, `formatDiskFree`).

**Action:**

1. Create `lib/formatters.ts` as the single source of truth for:
   - `detectClientPlatform() → DevicePlatform`
   - `formatCpuUsage(cpuPercent: number) → string`
   - `formatMemoryUsage(usedMb: number, totalMb: number) → string`
   - `formatDiskFree(freeGb: number, totalGb: number) → string`

2. Create `components/ui/formatted-text.tsx` for JSX inline Markdown rendering:
   - `<FormattedMessage text={...} />`
   - Supports `**bold**`, `` `code` ``, and `[link](url)`

3. Replace all duplicated local implementations in:
   - `components/enterprise-chat-view.tsx`
   - `components/tech-support-app.tsx`
   - `lib/enterprise/findings.ts`

**Files affected:**
- `lib/formatters.ts` *(new)*
- `components/ui/formatted-text.tsx` *(new)*
- `components/enterprise-chat-view.tsx` *(modified)*
- `components/tech-support-app.tsx` *(modified)*
- `lib/enterprise/findings.ts` *(modified)*

---

### 1.2 Decompose Monolithic View Components

**Problem:** `components/tech-support-app.tsx` and `components/enterprise-chat-view.tsx` handle state management, API polling, clipboard parsing, telemetry cards, and chat rendering inside single large files.

**Action:** Extract reusable sub-components into `components/diagnostics/`:

| Sub-component | Extracted from | Purpose |
|---|---|---|
| `components/diagnostics/telemetry-findings-card.tsx` | `enterprise-chat-view.tsx` | Read-only display of `EvidenceFinding[]` |
| `components/diagnostics/collector-instructions-card.tsx` | `enterprise-chat-view.tsx` | OS-specific script download/copy UI |
| `components/diagnostics/triage-quick-replies.tsx` | `enterprise-chat-view.tsx` | Chip-style quick reply buttons |

**Files affected:**
- `components/diagnostics/` *(new directory)*
- `components/enterprise-chat-view.tsx` *(modified — import extracted sub-components)*

---

### 1.3 Sync Collector Scripts via Build Step

**Problem:** Collector PowerShell/Bash scripts under `public/collectors/` may drift from `lib/enterprise/collector-scripts.ts` definitions.

**Action:**

1. Create `scripts/sync-collectors.mjs`:
   - Reads all `CollectorScriptDefinition` entries from `lib/enterprise/collector-scripts.ts`
   - Writes them to `public/collectors/<platform>.ps1|sh`
   - Exits non-zero if any file content differs from source-of-truth (CI guard)

2. Wire into the build: add `node scripts/sync-collectors.mjs` before `tsc` in `scripts/build-verified.sh`

**Files affected:**
- `scripts/sync-collectors.mjs` *(new)*
- `scripts/build-verified.sh` *(modified)*

---

### 1.4 Remove Dead Code

**Action:** Delete `examples/d1/` directory — it was used during initial D1 prototyping and is no longer referenced anywhere in the active codebase.

```bash
git rm -r examples/d1/
```

---

## Pillar 2 — Edge Reliability & Fault Tolerance

### 2.1 LLM Circuit Breaker

**Problem:** If Gemini/OpenAI is unavailable, `executeDeductiveTriage` will block until the platform timeout, causing cascading latency spikes across concurrent requests.

**Action:** Add a module-level circuit breaker in `lib/enterprise/ai-provider-adapter.ts`:

```typescript
// Module-level state (per isolate)
const breaker = {
  failures: 0,
  openUntil: 0,
  state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
};
```

**Behavior:**
- Each fetch to Gemini/OpenAI is wrapped with `AbortSignal.timeout(8_000)` (8 s hard cap)
- Retry **once** on 429 / 503 with exponential jitter (100–400 ms)
- After **3 consecutive failures** → `OPEN` for 60 s
- After 60 s → `HALF_OPEN` — next request is a probe
  - Success → `CLOSED` + reset counter
  - Failure → back to `OPEN` for another 60 s
- When `OPEN`, `executeDeductiveTriage` immediately returns the deterministic fallback response (no LLM call)
- Response header: `x-relay-ai-mode: "live" | "deterministic-fallback"`

**Files affected:**
- `lib/enterprise/ai-provider-adapter.ts` *(modified)*

---

### 2.2 Remediation Verification (`verifyRemediationDelta`)

**Problem:** After a remediation action (e.g., ending a high-CPU process), there is no automated comparison of before/after telemetry to confirm the fix worked.

**Action:** Add `verifyRemediationDelta()` to `lib/enterprise/findings.ts`:

```typescript
export interface RemediationDiff {
  metric: string;         // e.g. "cpuPercent"
  before: number;
  after: number;
  improved: boolean;
  badge: string;          // e.g. "CPU ↓ 91% → 12% ✅"
}

export function verifyRemediationDelta(
  before: TelemetrySnapshot,
  after: TelemetrySnapshot,
): RemediationDiff[]
```

**Checks:**
- `cpuPercent`: improved if `after < before - 5`
- `memUsedMb`: improved if `after < before - 50`
- `diskFreeGb`: improved if `after > before + 0.05`
- `dnsLatencyMs`: improved if after is defined and `after < before * 0.8`

**Files affected:**
- `lib/enterprise/findings.ts` *(modified)*
- `tests/enterprise-ai-provider.test.ts` *(add `verifyRemediationDelta` tests)*

---

### 2.3 Telemetry Redactor (`lib/telemetry-redactor.ts`)

**Problem:** Raw telemetry payloads may contain PII — Windows usernames in file paths, private IP addresses, MAC addresses, or accidentally pasted API keys in process command lines.

**Action:** Create `lib/telemetry-redactor.ts`:

```typescript
export interface RedactionResult {
  payload: TelemetrySnapshot;
  redactedFieldsCount: number;
}

export function redactTelemetryPayload(raw: TelemetrySnapshot): RedactionResult
```

**Redaction rules:**
| Pattern | Replacement |
|---|---|
| `/Users/<name>/` (macOS/Linux paths) | `/Users/[REDACTED]/` |
| `C:\Users\<name>\` (Windows paths) | `C:\Users\[REDACTED]\` |
| Private IPv4 (`10.x`, `172.16-31.x`, `192.168.x`) | `[PRIVATE-IP]` |
| Private IPv6 (`fc00::/7`) | `[PRIVATE-IPv6]` |
| MAC addresses (`xx:xx:xx:xx:xx:xx`) | `[MAC-REDACTED]` |
| Bearer tokens / API keys in process args | `[KEY-REDACTED]` |

**Wire-in:** Apply `redactTelemetryPayload()` server-side in `POST /api/cases/[id]/telemetry` before persisting the snapshot.

**Files affected:**
- `lib/telemetry-redactor.ts` *(new)*
- `app/api/cases/[id]/telemetry/route.ts` *(modified — apply redactor)*
- `tests/enterprise-ai-provider.test.ts` or new `tests/telemetry-redactor.test.ts` *(add tests)*

---

## Pillar 3 — Cloudflare D1 & Worker Scalability

### 3.1 Composite D1 Indexes

**Problem:** As case volume grows, queries filtering on `(status, createdAt)` or fetching by `(caseId, collectedAt)` do a full table scan.

**Action:** Create `drizzle/0005_scalability_indexes.sql`:

```sql
-- Composite index for case list queries (status + time-ordered pagination)
CREATE INDEX IF NOT EXISTS idx_cases_status_created
  ON enterprise_cases (status, created_at DESC);

-- Composite index for telemetry queries per case
CREATE INDEX IF NOT EXISTS idx_telemetry_case_collected
  ON enterprise_telemetry (case_id, collected_at DESC);

-- Index for idempotency key lookup
CREATE INDEX IF NOT EXISTS idx_idempotent_key
  ON idempotent_requests (idempotency_key, created_at DESC);
```

Mirror the migration to `enterprise/migrations/0005_scalability_indexes.sql`.

**Files affected:**
- `drizzle/0005_scalability_indexes.sql` *(new)*
- `enterprise/migrations/0005_scalability_indexes.sql` *(new)*

---

### 3.2 Cursor Pagination on `GET /api/cases`

**Problem:** `GET /api/cases` returns all cases with no pagination — will OOM the Worker on large datasets.

**Action:** Add cursor/limit pagination:

```
GET /api/cases?limit=25&cursor=<opaque_cursor>
```

- `limit`: 1–100 (default 25, max 100)
- `cursor`: opaque base64 token encoding `{ createdAt, id }` of the last seen row
- Response:
  ```json
  { "cases": [...], "nextCursor": "<token>|null", "total": 0 }
  ```

**Files affected:**
- `app/api/cases/route.ts` *(modified)*
- `lib/case-store.ts` *(modified — `listCases(db, { limit, cursor })`)*

---

### 3.3 Idempotent Reservation TTL Sweeper

**Problem:** Stale in-flight idempotent reservations (status = `'in_flight'`) older than 2 minutes block retries forever if the Worker crashed mid-request.

**Action:** Add `pruneExpiredReservations()` to `lib/idempotent-create.ts`:

```typescript
export async function pruneExpiredReservations(
  db: D1Database,
  ttlMs = 120_000,
): Promise<number>   // returns count of rows deleted
```

- Deletes rows where `status = 'in_flight'` and `created_at < now - ttlMs`
- Call during Worker startup (once per isolate lifetime) and from a scheduled Cron Trigger (`*/2 * * * *`)

**Files affected:**
- `lib/idempotent-create.ts` *(modified)*
- `enterprise/worker.ts` *(modified — call on startup + scheduled handler)*
- `tests/idempotent-atomicity.test.ts` *(add TTL pruning tests)*

---

### 3.4 Payload Size Guards

**Problem:** Unbounded telemetry and AI triage payloads can exhaust Worker CPU / memory budget.

**Action:** Enforce hard size limits before JSON parsing:

| Endpoint | Max payload |
|---|---|
| `POST /api/cases/[id]/telemetry` | 64 KB |
| `POST /api/ai/triage` | 64 KB |

Return `413 Payload Too Large` with JSON error body `{ ok: false, error: "Payload exceeds 64 KB limit." }` if exceeded.

Note: `boundedJson()` in `lib/enterprise/http.ts` already accepts a `maxBytes` parameter — pass `65_536`.

**Files affected:**
- `enterprise/worker.ts` *(modified — pass maxBytes to boundedJson)*
- `app/api/ai/triage/route.ts` *(modified)*
- `app/api/cases/[id]/telemetry/route.ts` *(modified)*

---

### 3.5 Rate Limiting (`lib/rate-limit.ts`)

**Problem:** No per-IP / per-session rate limits protect AI triage and telemetry ingestion endpoints from abuse.

**Action:** Create `lib/rate-limit.ts` with a sliding window counter (in-memory, per-isolate):

```typescript
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): {
  allowed: boolean;
  remaining: number;
  resetAt: number;  // epoch ms
}
```

**Limits:**
| Endpoint | Key | Limit |
|---|---|---|
| `POST /api/ai/triage` | `ip` or `cf-connecting-ip` | 20 req / min |
| `POST /api/cases/[id]/telemetry` | `caseId` | 10 req / min |

Return `429 Too Many Requests` with headers `Retry-After` and `X-RateLimit-Reset` when exceeded.

**Files affected:**
- `lib/rate-limit.ts` *(new)*
- `enterprise/worker.ts` *(modified — apply rate limiting)*
- `app/api/ai/triage/route.ts` *(modified)*

---

## Test Coverage

| Area | Test file | New tests |
|---|---|---|
| Telemetry redactor | `tests/telemetry-redactor.test.ts` | Path scrubbing, IP scrubbing, MAC scrubbing, key scrubbing |
| Remediation delta | `tests/enterprise-ai-provider.test.ts` | CPU improved, mem improved, no-change, mixed |
| TTL pruning | `tests/idempotent-atomicity.test.ts` | Stale rows deleted, fresh rows preserved |
| Pagination | `tests/enterprise-cases.test.ts` | First page, cursor advance, limit clamping |
| Rate limiting | `tests/rate-limit.test.ts` | Under limit, at limit, exceeded, window reset |
| Circuit breaker | `tests/enterprise-ai-provider.test.ts` | CLOSED→OPEN on 3 failures, OPEN→HALF_OPEN→CLOSED on recover |

---

## Checklist

### Pillar 1 — Clean Code
- [x] `lib/formatters.ts` created
- [x] `components/ui/formatted-text.tsx` created
- [x] `components/diagnostics/telemetry-findings-card.tsx` extracted
- [x] `components/diagnostics/collector-instructions-card.tsx` extracted
- [x] `components/diagnostics/triage-quick-replies.tsx` extracted
- [x] Duplicated helpers removed from `enterprise-chat-view.tsx`, `tech-support-app.tsx`, `findings.ts`
- [x] `scripts/sync-collectors.mjs` created and wired into build
- [x] `examples/d1/` removed

### Pillar 2 — Reliability
- [x] Circuit breaker added to `ai-provider-adapter.ts`
- [x] `x-relay-ai-mode` response header emitted
- [x] `verifyRemediationDelta()` implemented in `findings.ts`
- [x] `lib/telemetry-redactor.ts` created
- [x] Redactor wired into telemetry ingestion endpoint
- [x] Tests passing for redactor and delta verification

### Pillar 3 — Scalability
- [x] `drizzle/0005_scalability_indexes.sql` created
- [x] `enterprise/migrations/0005_scalability_indexes.sql` created
- [x] Cursor pagination on `GET /api/cases`
- [x] `pruneExpiredReservations()` implemented and wired
- [x] 64 KB payload guards on triage + telemetry endpoints
- [x] `lib/rate-limit.ts` created and applied
- [x] All new tests passing

### Final Gate
- [x] `node scripts/test-backend.mjs` — all 194 pass, 0 fail
- [x] `node tests/enterprise-runtime.mjs` — pass (58 assertions)
- [x] `bash scripts/build-verified.sh` — exit 0
- [ ] `git commit` with message: `feat(phase3): reliability, scalability & clean code sprint`

---

## Implementation Notes

> [!IMPORTANT]
> Never use elevation commands (`sudo`, `RunAs`) in any remediation scripts. All collector scripts must remain non-elevated and read-only.

> [!NOTE]
> `ValidationResult<T>` is a discriminated union `{ ok: true; value: T } | { ok: false; error: string }`. Always narrow to `ok: false` before accessing `.error` — TypeScript will error otherwise.

> [!TIP]
> `boundedJson()` in `lib/enterprise/http.ts` already accepts a `maxBytes` parameter. Use `boundedJson(request, 65_536)` rather than adding a separate size check.

> [!WARNING]
> Circuit breaker state is **per-isolate** (in-memory). On Worker cold starts, `failures` resets to 0. This is acceptable — the breaker protects against cascading failures in a single isolate, not globally.
