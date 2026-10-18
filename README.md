# Relay — Enterprise Tech Support & Remote Diagnostics Platform

Relay is a non-elevated, privacy-first IT diagnostics and conversational triage platform designed for IT helpdesks and Managed Service Providers (MSPs). It combines **zero-install browser probes**, **read-only OS telemetry collectors**, an **enterprise IT runbook RAG engine**, and **multi-turn AI triage** to accelerate remote troubleshooting while guaranteeing zero elevated permissions.

---

## Architecture Overview

```
relay-tech-support/
├── app/                          # Next.js App Router (pages & server endpoints)
│   ├── api/
│   │   ├── ai/triage/            # Multi-turn deductive AI triage endpoint (Gemini / OpenAI)
│   │   ├── auth/me/              # Principal session resolution & role authorization
│   │   ├── cases/                # Case CRUD, cursor pagination & idempotent creation
│   │   │   └── [id]/
│   │   │       ├── ai-explain/   # Grounded telemetry case explanation
│   │   │       └── telemetry/    # PII-redacted telemetry ingestion & delta verification
│   │   └── collectors/[platform]/# Dynamic collector script serving
│   ├── layout.tsx                # Root layout & design system providers
│   └── page.tsx                  # Primary workspace entry
│
├── components/                   # React UI component library
│   ├── diagnostics/              # Extracted diagnostic UI modules
│   │   ├── collector-instructions-card.tsx # OS script download & clipboard ingestion
│   │   ├── telemetry-findings-card.tsx     # Evidence-linked findings & remediation preview
│   │   └── triage-quick-replies.tsx        # Deductive quick-reply chips & probe triggers
│   ├── ui/                       # Reusable UI primitives
│   │   └── formatted-text.tsx    # Safe inline Markdown parser (**bold**, `code`)
│   ├── enterprise-chat-view.tsx  # Multi-turn conversational investigation workspace
│   └── tech-support-app.tsx      # Legacy guided diagnostic workflow view
│
├── enterprise/                   # Cloudflare Worker enterprise runtime
│   ├── migrations/               # D1 enterprise database migrations
│   │   ├── 0001_foundation.sql   # Multi-tenant tables (orgs, memberships, sessions, cases)
│   │   └── 0005_scalability_indexes.sql # Composite indexes for status & pagination
│   ├── worker.ts                 # Standalone edge Worker request router & handlers
│   └── wrangler.jsonc            # Cloudflare Worker configuration & D1 bindings
│
├── drizzle/                      # Next.js App SQLite / D1 database migrations
│   ├── 0000–0004_*.sql           # Cases, measurements, analysis snapshots & idempotency
│   └── 0005_scalability_indexes.sql # Composite indexes for case list & request reservations
│
├── lib/                          # Core domain libraries & shared utilities
│   ├── browser-probe.ts          # Zero-install WebAPI client diagnostics (GPU, memory, ping)
│   ├── case-store.ts             # Case projection & public serialization
│   ├── formatters.ts             # Single source of truth for platform detection & metric strings
│   ├── idempotent-create.ts      # Atomic reservation, TTL sweeper & replay protection
│   ├── rate-limit.ts             # In-memory sliding-window rate limiter
│   ├── telemetry-redactor.ts     # PII scrubber (Windows/Unix paths, private IPs, MAC, tokens)
│   ├── validation.ts             # Input validation, bounds checking & security assertions
│   └── enterprise/               # Enterprise diagnostic & AI subsystem
│       ├── ai-provider-adapter.ts# Gemini 2.5 / GPT-4o adapter, circuit breaker & fallback
│       ├── collector-scripts.ts  # Source-of-truth PowerShell / Bash collector definitions
│       ├── contracts.ts          # Canonical TypeScript interfaces for telemetry, findings, cases
│       ├── diagnostic-report.ts  # Self-contained offline HTML artifact generator (strict CSP)
│       ├── findings.ts           # Telemetry threshold rules & verifyRemediationDelta()
│       ├── rag/                  # Enterprise RAG engine
│       │   ├── runbooks.ts       # Curated enterprise IT runbook knowledge base
│       │   ├── retriever.ts      # Symptom & finding relevance scoring
│       │   └── index.ts          # Prompt context injection
│       ├── remediation-catalog.ts# Zero-elevation catalog actions & parameter schemas
│       └── telemetry-validation.ts # Strict TelemetrySnapshot parser & bounds validator
│
├── public/                       # Static assets & synchronized collector shell scripts
│   └── collectors/               # Cached collector scripts (windows11.ps1, ubuntu.sh, macos.sh)
│
├── scripts/                      # Developer and CI utility scripts
│   ├── build-verified.sh         # 5-stage vinext build pipeline with timeout & collector sync
│   ├── sync-collectors.mjs       # Collector script sync & drift validation
│   └── test-backend.mjs          # Node.js native test runner & TypeScript compiler
│
├── tests/                        # Comprehensive test suite (194 tests)
│   ├── enterprise-ai-provider.test.ts # Model allowlist, alternating turns & fallback tests
│   ├── enterprise-evals.test.ts       # AI output accuracy & safety benchmark evaluations
│   ├── enterprise-rag.test.ts         # RAG runbook scoring & context injection tests
│   ├── enterprise-runtime.mjs         # 58 local workerd / D1 HTTP regression assertions
│   ├── idempotent-atomicity.test.ts   # SQLite atomic batch reservations & TTL pruning tests
│   ├── rate-limit.test.ts             # Sliding-window rate limiting tests
│   ├── remediation-delta.test.ts      # Telemetry before/after improvement delta tests
│   └── telemetry-redactor.test.ts     # PII path, IP, MAC & API key scrubbing tests
│
└── docs/                         # Specifications, architecture plans & audit notes
    ├── PHASE_3_RELIABILITY_SCALABILITY_AND_CLEAN_CODE.md # Phase 3 sprint specification
    ├── ENTERPRISE-PLAN.md        # Enterprise target architecture & acceptance gates
    └── DIAGNOSTIC_WORKFLOW.md    # Multi-turn triage & remediation lifecycle spec
```

---

## Core Capabilities

### 1. Socratic Deductive Triage & Multi-Turn AI
* **Provider Support**: Google Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`) and OpenAI (`gpt-4o`, `gpt-4o-mini`).
* **Strict Turn Invariant**: Implements role alternation normalization (`buildGeminiContents`) to drop leading assistant greetings and merge contiguous user turns.
* **Context Synthesis**: Automatically merges client WebAPI browser probes, OS collector telemetry, and proposed remediation state into the prompt prefix—eliminating user re-prompting.
* **Enterprise RAG Knowledge Base**: Matches detected symptoms (e.g. thermal throttling, DNS failure, low disk headroom) against curated runbooks and injects remediation guidance directly into the system prompt.

### 2. Zero-Install Browser WebAPI Diagnostics
* Gathers hardware concurrency (logical CPU cores), estimated device memory, network round-trip ping, GPU renderer string, and indexed storage quota without downloading or executing any external binary.

### 3. Non-Elevated, Read-Only OS Telemetry Collectors
* Tailored scripts for **Windows 11** (PowerShell 5.1+), **Ubuntu Linux** (Bash + Python 3), and **macOS Apple Silicon** (Bash + Python 3).
* Gathers paired-sample CPU usage, total/used memory, storage capacity, and process tables.
* Safely executes from system temp folders (`$env:TEMP` / `/tmp`) and copies telemetry JSON directly to the user's clipboard or active browser callback URL.

### 4. Non-Elevated Remediation Catalog & Closed-Loop Verification
* Every remediation proposal is guaranteed non-elevated (no `sudo`, `RunAs`, force-kill `-9`, or registry edits).
* Every action includes rollback instructions and consequence disclosures.
* **`verifyRemediationDelta()`** compares before and after telemetry snapshots to issue verified badges (e.g. `CPU ↓ 92% → 20% ✅`).

### 5. Edge Reliability & Security Guards
* **Circuit Breaker**: Trips to `OPEN` for 60s after 3 consecutive LLM failures with exponential jitter on 429/503 status codes, serving instant deterministic responses.
* **PII Redaction**: Strips user profile paths (`/Users/[REDACTED]/`, `C:\Users\[REDACTED]\`), RFC 1918 private IPv4/IPv6 addresses, MAC addresses, and Bearer tokens before database persistence.
* **Rate Limiting**: Sliding-window counter enforcing 20 AI turns/min and 10 telemetry uploads/min.
* **Payload Size Limits**: Strict 64 KB payload ceiling on all ingestion routes.

---

## Development & Verification

### Prerequisites
* **Node.js**: v22+ (v24 recommended)
* **pnpm**: v11.25.0

### Installation
```bash
pnpm install --frozen-lockfile
```

### Running Backend & Unit Tests
```bash
# Compiles TypeScript and runs all 194 unit and integration tests via node:test
node scripts/test-backend.mjs
```

### Running Cloudflare Worker Runtime Regressions
```bash
# Spins up an isolated local workerd / D1 instance and executes 58 HTTP assertions
node tests/enterprise-runtime.mjs
```

### Verified Production Build
```bash
# Verifies collector script synchronization, compiles assets, and runs 5-stage vinext build
bash scripts/build-verified.sh
```

### Running Development Server Locally
```bash
# Start local preview server on port 8790
npm run dev
```

---

## Safety & Non-Elevation Guarantees

| Invariant | Guarantee |
|---|---|
| **Zero Elevation** | No collector or remediation action ever requests administrative rights, `sudo`, `runas`, or `Start-Process -Verb RunAs`. |
| **No Force Kills** | Remediation actions target bounded processes gracefully; `kill -9` and `Stop-Process -Force` are strictly forbidden. |
| **System PID Protection** | Actions explicitly prohibit targeting PID 0 (System Idle) or core OS services. |
| **Air-Gapped Reports** | Exported HTML artifacts contain zero external network dependencies and enforce a strict `default-src 'none'` Content-Security-Policy. |
| **Transparent Telemetry** | Raw telemetry JSON is presented for user review prior to upload and automatically scrubbed of all private identifying paths and network addresses. |
