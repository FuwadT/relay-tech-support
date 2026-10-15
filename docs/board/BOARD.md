# AI Tech Support MVP (Relay) — Scrum Board

**Owner**: Fuwad Tufail  
**Planning Date**: October 13, 2026  
**Cadence**: Eight weekly sprints (~10–15 hours / week)  
**Customer Acquisition**: Handled by the founder; recruitment, interviews, and discovery are excluded from this backlog.  
**Working Hosted URL**: [tech-support-mvp-fuwad.fuwadtufail.chatgpt.site](https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site)  
**Local Runtime URL**: `http://127.0.0.1:8787` (Cloudflare D1 Worker runtime)

---

## Kanban Board

| 📋 Backlog (32) | 🚀 Ready (1) | 🔄 In Progress (0) | 🛑 Blocked (0) | ✅ Complete (22) |
| :--- | :--- | :--- | :--- | :--- |
| - **[S4-02](issues/S4-02.md)** Implement customer identity (`120m`, *Platform agent*)<br>- **[S4-03](issues/S4-03.md)** Enforce server authorization (`120m`, *Platform agent*)<br>- **[S4-04](issues/S4-04.md)** Build the support queue (`90m`, *Product*)<br>- **[S4-05](issues/S4-05.md)** Add review notes and history (`90m`, *Platform agent*)<br>- **[S4-06](issues/S4-06.md)** Add deletion and retention behavior (`90m`, *Platform agent*)<br>- **[S4-07](issues/S4-07.md)** Verify access boundaries (`90m`, *Verification agent*)<br>- **[S5-01](issues/S5-01.md)** Define the model contract (`60m`, *Coordinator*)<br>- **[S5-02](issues/S5-02.md)** Connect the server-side provider (`90m`, *Platform agent*) ⚠️ *prereq*<br>- **[S5-03](issues/S5-03.md)** Ground responses in case evidence (`120m`, *Diagnostics agent*)<br>- **[S5-04](issues/S5-04.md)** Validate outputs and fallback (`90m`, *Platform agent*)<br>- **[S5-05](issues/S5-05.md)** Add usage controls (`90m`, *Platform agent*)<br>- **[S5-06](issues/S5-06.md)** Evaluate representative cases (`120m`, *Verification agent*)<br>- **[S5-07](issues/S5-07.md)** Update product language (`60m`, *Product*)<br>- **[S6-01](issues/S6-01.md)** Review mobile layouts (`90m`, *Product*)<br>- **[S6-02](issues/S6-02.md)** Review accessibility (`90m`, *Product*)<br>- **[S6-03](issues/S6-03.md)** Handle interrupted work (`90m`, *Platform agent*)<br>- **[S6-04](issues/S6-04.md)** Add operational visibility (`90m`, *Platform agent*)<br>- **[S6-05](issues/S6-05.md)** Rehearse recovery (`90m`, *Platform agent*)<br>- **[S6-06](issues/S6-06.md)** Run a release regression (`120m`, *Verification agent*)<br>- **[S7-01](issues/S7-01.md)** Define the paid offer (`60m`, *Coordinator*)<br>- **[S7-02](issues/S7-02.md)** Build the upgrade flow (`90m`, *Product*)<br>- **[S7-03](issues/S7-03.md)** Integrate hosted checkout (`120m`, *Platform agent*) ⚠️ *prereq*<br>- **[S7-04](issues/S7-04.md)** Verify payment events (`120m`, *Platform agent*)<br>- **[S7-05](issues/S7-05.md)** Add support fulfillment tracking (`90m`, *Platform agent*)<br>- **[S7-06](issues/S7-06.md)** Rehearse payment failures and refunds (`120m`, *Verification agent*)<br>- **[S8-01](issues/S8-01.md)** Define operational metrics (`60m`, *Coordinator*)<br>- **[S8-02](issues/S8-02.md)** Add a simple metrics view (`90m`, *Product*)<br>- **[S8-03](issues/S8-03.md)** Prepare release configuration (`90m`, *Platform agent*)<br>- **[S8-04](issues/S8-04.md)** Run acceptance checks (`120m`, *Verification agent*)<br>- **[S8-05](issues/S8-05.md)** Prepare support instructions (`90m`, *Coordinator*)<br>- **[S8-06](issues/S8-06.md)** Release and smoke-check (`60m`, *Platform agent*)<br>- **[S8-07](issues/S8-07.md)** Prioritize the next backlog (`90m`, *Coordinator*) | - **[S4-01](issues/S4-01.md)** Design customer/support roles (`60m`, *Coordinator*) | *Empty* | *Empty* | - **[S1-01](issues/S1-01.md)** Define the release boundary (`45m`, *Coordinator*)<br>- **[S1-02](issues/S1-02.md)** Set up the application (`90m`, *Platform agent*)<br>- **[S1-03](issues/S1-03.md)** Build the application shell (`90m`, *Product*)<br>- **[S1-04](issues/S1-04.md)** Agree the case contract (`60m`, *Coordinator*)<br>- **[S1-05](issues/S1-05.md)** Add D1 persistence (`120m`, *Platform agent*)<br>- **[S1-06](issues/S1-06.md)** Add shared interface states (`90m`, *Product*)<br>- **[S1-07](issues/S1-07.md)** Verify the foundation (`105m`, *Verification agent*)<br>- **[S2-01](issues/S2-01.md)** Build the intake form (`90m`, *Product*)<br>- **[S2-02](issues/S2-02.md)** Create slowdown rules (`90m`, *Diagnostics agent*)<br>- **[S2-03](issues/S2-03.md)** Create connectivity rules (`90m`, *Diagnostics agent*)<br>- **[S2-04](issues/S2-04.md)** Render the guided plan (`90m`, *Product*)<br>- **[S2-05](issues/S2-05.md)** Save checklist progress (`90m`, *Platform agent*)<br>- **[S2-06](issues/S2-06.md)** Record the outcome (`75m`, *Product*)<br>- **[S2-07](issues/S2-07.md)** Add a private review view (`60m`, *Product*)<br>- **[S2-08](issues/S2-08.md)** Check both complete journeys (`75m`, *Verification agent*)<br>- **[S3-01](issues/S3-01.md)** Define useful measurements (`60m`, *Diagnostics agent*)<br>- **[S3-02](issues/S3-02.md)** Add baseline entry (`90m`, *Product*)<br>- **[S3-03](issues/S3-03.md)** Add follow-up entry (`90m`, *Product*)<br>- **[S3-04](issues/S3-04.md)** Build outcome comparisons (`90m`, *Product*)<br>- **[S3-05](issues/S3-05.md)** Add rule provenance (`90m`, *Diagnostics agent*)<br>- **[S3-06](issues/S3-06.md)** Verify contradictory and missing evidence (`90m`, *Verification agent*)<br>- **[S3-07](issues/S3-07.md)** Document the diagnostic workflow (`90m`, *Coordinator*) |

---

## Active Priority Queue (Sprint 4 Focus)

With **Sprint 1**, **Sprint 2**, and **Sprint 3** fully completed and runtime verified, execution advances to **Sprint 4 (Customer accounts and support operations)**:
1. **[S4-01](issues/S4-01.md)**: Design customer/support roles — define permissions matrix and denied operations across roles.
2. **[S4-02](issues/S4-02.md)**: Implement customer identity — extend access model to distinguish customer vs operator while preserving owner-scoped isolation.
3. **[S4-03](issues/S4-03.md)**: Enforce server authorization — verify cross-user boundary defense and support role data boundaries.

---

## Sprint Summaries

| Sprint | Status | Budget | Tasks | Done | Remaining |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [Sprint 1 — Foundation and application shell](sprints/S1-foundation.md) | `Complete` | Approximately 10 hours (600m) | 7 | 7 | 0 min |
| [Sprint 2 — Guided case workflow](sprints/S2-guided-workflow.md) | `Complete` | Approximately 11 hours (660m) | 8 | 8 | 0 min |
| [Sprint 3 — Evidence and measurable outcomes](sprints/S3-measurements.md) | `Complete` | Approximately 10 hours (600m) | 7 | 7 | 0 min |
| [Sprint 4 — Customer accounts and support operations](sprints/S4-multiuser-accounts.md) | `Ready` | Approximately 11 hours (660m) | 7 | 0 | 660 min |
| [Sprint 5 — Live AI explanations](sprints/S5-ai-integration.md) | `Not started` | 10.5 hours of tasks + 30 minutes contingency (630m) | 7 | 0 | 630 min |
| [Sprint 6 — Usability and service reliability](sprints/S6-reliability.md) | `Not started` | 9.5 hours of tasks + 30 minutes contingency (570m) | 6 | 0 | 570 min |
| [Sprint 7 — Paid assisted support](sprints/S7-paid-support.md) | `Not started` | Approximately 10 hours (600m) | 6 | 0 | 600 min |
| [Sprint 8 — Release and next-sprint decisions](sprints/S8-release.md) | `Not started` | Approximately 10 hours (600m) | 7 | 0 | 600 min |
| **Total** | — | **4920m (~82h)** | **55** | **22** | **3000m** |

---

## Milestones Tracker

| Milestone | Status | Verification Evidence |
| :--- | :--- | :--- |
| **Source Review** | ✅ Verified | S1-01, S1-04, S2-02, S2-03, S3-01, S3-05 contracts, schema, and diagnostics verified. |
| **Unit Test Suite** | ✅ Verified | 18/18 backend and diagnostic tests passed (`tests/diagnostics.test.ts`, `tests/backend-ownership.test.ts`). |
| **Clean Build** | ✅ Verified | TypeScript check (`tsc --noEmit`) and production build (`npm run build`) passed with 0 errors. |
| **D1 Schema Migration** | ✅ Verified | Applied `drizzle/0000_*.sql` and `drizzle/0001_add_measurements_and_provenance.sql` to local D1 via Wrangler. |
| **Private Deployment** | ✅ Verified | Active Site at [tech-support-mvp-fuwad.fuwadtufail.chatgpt.site](https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site). |
| **Runtime Acceptance** | ✅ Verified | Complete 13-test acceptance suite passed (`test_runtime_e2e.py`): intake rejections, signed-in CRUD, reload persistence across server restart, multi-user isolation, measurements capture, bounds validation, outcome recording, and deletion. |
| **Customer Production** | ⬜ Not started | Multi-user customer accounts (S4), payments (S7), and live AI provider (S5). |

---

## Operating Documents & Protocol
- 👥 **[Agent Roles & Ownership](ROLES.md)**: Clear file ownership and collision prevention rules.
- 📜 **[Living Handoff Log](HANDOFF.md)**: Session log updated between agent handoffs.
- 🏁 **[First Working Session Checklist](FIRST-SESSION.md)**: Initial startup checks (all 5 items complete).
- 🎯 **[Final Release Checklist](RELEASE-CHECKLIST.md)**: 8-point customer readiness gate.
- 📦 **[Deferred Backlog & Boundaries](DEFERRED.md)**: Out-of-scope and future feature boundaries.
- 📘 **[Diagnostic Workflow Guide](../DIAGNOSTIC_WORKFLOW.md)**: Operational taxonomy and evaluation protocols.
