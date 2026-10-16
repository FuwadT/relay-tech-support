# Relay Tech Support — Phase 2 AI Triage & Architecture Completion Plan

**Status:** Phase 1 UX & Collector Fixes Verified (`781620927a90ff2b21fdb90811b00d44a93bef04`)
**Objective:** Synchronize the Enterprise Worker, AI Provider Adapter, Zero-Install Browser Probes, Collector Deduplication, and Runtime E2E Tests with the Phase 1 Conversational Triage workflow.

**Target Files to Update:**
- `lib/enterprise/ai-provider-adapter.ts`
- `lib/enterprise/assistant-tools.ts`
- `lib/enterprise/contracts.ts`
- `enterprise/worker.ts`
- `components/enterprise-chat-view.tsx`
- `components/tech-support-app.tsx`
- `app/api/collectors/[platform]/route.ts`
- `tests/enterprise-ai-provider.test.ts`
- `tests/enterprise-runtime.mjs`
- `tests/runtime.mjs`

---

## 1. Upgrade `lib/enterprise/ai-provider-adapter.ts` & `lib/enterprise/contracts.ts` for Multi-Turn Deductive Triage

### Problem
In Phase 1, `components/enterprise-chat-view.tsx` and `app/api/cases/[id]/ai-explain/route.ts` were updated to support multi-turn conversational triage (`intake_discovery` -> `deductive_questioning` -> `active_investigation`), quick-reply chips, and symptom-aware follow-up answers. However, `lib/enterprise/ai-provider-adapter.ts` and `lib/enterprise/contracts.ts` were left untouched. When the Enterprise Worker (`enterprise/worker.ts`) invokes the AI provider adapter, it still uses single-shot prompt formatting without `TriageStage`, `quickReplies`, or deductive hypothesis pruning.

### Implementation Spec
1. **Add Conversational Triage Types to `lib/enterprise/contracts.ts`**:
   ```typescript
   export type EnterpriseTriageStage =
     | 'intake_discovery'
     | 'deductive_questioning'
     | 'browser_probe'
     | 'awaiting_authorization'
     | 'awaiting_telemetry'
     | 'active_investigation';

   export interface TriageHypothesis {
     id: string;
     domain: 'cpu_thermal' | 'memory' | 'disk_io' | 'network_dns' | 'application' | 'permissions';
     summary: string;
     confidence: number; // 0.0 - 1.0
     status: 'active' | 'ruled_out' | 'confirmed';
   }

   export interface DeductiveTriageResponse {
     stage: EnterpriseTriageStage;
     reply: string;
     quickReplies: string[];
     hypotheses: TriageHypothesis[];
     recommendedAction: 'ask_clarifying_question' | 'run_browser_probe' | 'request_os_collector' | 'propose_remediation' | 'escalate';
     addressedSymptomMismatch?: boolean;
   }
   ```

2. **Update System Prompt & Adapter Logic in `lib/enterprise/ai-provider-adapter.ts`**:
   - Enforce the **Socratic One-Question Rule**:
     - If `stage === 'intake_discovery'`, greet the user and ask: *"What seems to be the issue you are having?"* along with 3–4 clickable `quickReplies`.
     - If `stage === 'deductive_questioning'`, formulate 2–4 internal `hypotheses` based on the user's stated symptom and ask **exactly one** clarifying question designed to rule out at least one fault domain.
     - If `stage === 'active_investigation'` (telemetry snapshot already exists), answer any follow-up question directly using the metrics in the active snapshot. Never reset or ask the user to re-authorize the device unless they explicitly ask for a fresh sample.
     - If the user's initial symptom (e.g., `"high CPU and loud fan noise"`) is not reflected in the current telemetry snapshot (e.g., `cpuUsagePercent` is `null` or normal while `dnsStatus` is `Failed`), set `addressedSymptomMismatch = true` and explicitly explain both the missing/normal CPU reading and the secondary finding in `reply`.

3. **Update `lib/enterprise/assistant-tools.ts`**:
   - Add a `run_browser_diagnostic_probe` tool definition alongside existing collector and remediation tools so the assistant can request zero-install browser telemetry before falling back to OS shell/PowerShell scripts.

---

## 2. Add Zero-Install Browser WebAPI Diagnostics ("True Zero-Install First")

### Problem
The UI header promises *"Zero-Install Resolution First"*, and the deductive questioning step asks clarifying questions, but the app still relies on either simulated fixtures (`Simulate High CPU`, `Simulate DNS Fault`) or downloading an OS script (`windows11.ps1`, `macos.sh`, `ubuntu.sh`) to gather actual numbers.

### Implementation Spec
Create a client-side helper (`lib/browser-probe.ts` or inside `components/enterprise-chat-view.tsx` and `components/tech-support-app.tsx`) that gathers real, non-intrusive browser telemetry in `< 1.5 seconds` with **zero downloads and zero terminal commands**:

```typescript
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
```

- **How it works**:
  1. Reads `navigator.hardwareConcurrency` and `(navigator as any).deviceMemory`.
  2. Reads `(navigator as any).connection` (`effectiveType`, `downlink`, `rtt`).
  3. Measures a live `fetch('/api/auth/me', { cache: 'no-store' })` round-trip (`apiPingMs`) and inspects `performance.getEntriesByType('navigation')[0]` for DNS and TCP timing.
  4. Calls `await navigator.storage?.estimate()` to check available disk/origin storage quota.
  5. Queries a temporary offscreen `<canvas>` WebGL context (`WEBGL_debug_renderer_info`) to identify the GPU renderer (detecting software rendering fallbacks that cause high CPU and fan noise during video calls or browser usage!).
- **UX Integration**:
  - During `deductive_questioning`, offer a **`Run Instant Browser Check (No Download)`** button.
  - If the user reports browser freezes, video call lag, or Wi-Fi/DNS issues, run this probe immediately in the browser and feed the findings into the chat without ever asking them to open PowerShell or Terminal.

---

## 3. Mirror Telemetry Callback & Collector Routes in `enterprise/worker.ts`

### Problem
Phase 1 added `POST /api/cases/[id]/telemetry` in `app/api/cases/[id]/telemetry/route.ts` and updated `app/api/collectors/[platform]/route.ts`, but `enterprise/worker.ts` was not updated.

### Implementation Spec
1. In `enterprise/worker.ts`, add route handling for:
   - `POST /api/cases/:id/telemetry` (or `/enterprise/cases/:id/telemetry`): Validates and stores incoming collector telemetry snapshots pushed directly from `windows.ps1`, `macos.sh`, or `ubuntu.sh` using the ephemeral callback token/URL.
   - `GET /api/collectors/:platform`: Dynamically injects `RELAY_CALLBACK_URL` and `CASE_ID` query parameters into the script served by the Enterprise Worker, matching the behavior of `app/api/collectors/[platform]/route.ts`.

---

## 4. Deduplicate the 7 Collector Script Files into a Single Canonical Source

### Problem
The repository currently maintains duplicate copies of collector scripts across:
- `enterprise/collectors/macos.sh` & `public/collectors/macos.sh`
- `enterprise/collectors/ubuntu.sh` & `public/collectors/ubuntu.sh`
- `enterprise/collectors/windows.ps1`, `public/collectors/windows.ps1`, & `public/collectors/windows11.ps1`

### Implementation Spec
1. Treat `enterprise/collectors/{macos.sh,ubuntu.sh,windows.ps1}` as the single source of truth (or embed the canonical templates inside `lib/enterprise/collector-scripts.ts`).
2. Add a build/verification synchronization check in `scripts/test-backend.mjs` (or a test in `tests/enterprise-windows-collector.test.ts`) that asserts byte-for-byte parity between `enterprise/collectors/*` and `public/collectors/*` so they can never drift apart.

---

## 5. Expand Automated Tests (`tests/enterprise-ai-provider.test.ts`, `tests/enterprise-runtime.mjs`, `tests/runtime.mjs`)

### Implementation Spec
1. **`tests/enterprise-ai-provider.test.ts`**:
   - Add unit tests verifying that `ai-provider-adapter.ts` returns structured `DeductiveTriageResponse` payloads with `quickReplies`, `hypotheses`, and `stage` transitions.
   - Test that follow-up questions in `active_investigation` stage reference existing telemetry metrics and do not reset to `awaiting_authorization`.
   - Test that symptom-vs-telemetry mismatches (e.g., user reports high CPU/fan noise, snapshot only has DNS fault and `cpuUsagePercent: null`) set `addressedSymptomMismatch: true` and explain the discrepancy.
2. **`tests/enterprise-runtime.mjs` & `tests/runtime.mjs`**:
   - Add an E2E test case for `POST /api/cases/[id]/telemetry` verifying that a script callback updates the case's telemetry snapshot and transitions the case state automatically.
   - Add an E2E test verifying `GET /api/collectors/windows11.ps1?caseId=test-123` injects the callback URL and `$env:TEMP` path cleanly.

---

## 6. Verification Commands

Run all of the following commands and confirm zero errors before committing:

```bash
node scripts/test-backend.mjs
node scripts/verify-recovery.mjs
node tests/runtime.mjs
node tests/runtime-access.mjs
node tests/runtime-idempotency.mjs
node tests/enterprise-runtime.mjs
bash scripts/build-verified.sh
```
