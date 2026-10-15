# AI Tech Support MVP (Relay) — Scrum Board

> Integration review correction, October 15: the completion counts below are author-reported implementation status and are not accepted verification. Sprints 1–5 remain in progress until their runtime and release gates pass. See `../coordination/STATUS.md` and `../coordination/ACCESS-VERIFICATION.md`. S4 hosted authorization, S5 live-provider safety, durable limits and current browser journeys remain outstanding. Do not advance a release from these counts.

**Owner**: Fuwad Tufail  
**Planning Date**: October 13, 2026  
**Cadence**: Eight weekly sprints (~10–15 hours / week)  
**Customer Acquisition**: Handled by the founder; recruitment, interviews, and discovery are excluded from this backlog.  
**Working Hosted URL**: [tech-support-mvp-fuwad.fuwadtufail.chatgpt.site](https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site)  
**Local Runtime URL**: `http://127.0.0.1:8787` (Cloudflare D1 Worker runtime)

---

## Kanban Board

| 📋 Backlog (19) | 🚀 Ready (1) | 🔄 In Progress (0) | 🛑 Blocked (0) | ✅ Complete (36) |
| :--- | :--- | :--- | :--- | :--- |
| - **[S6-02](issues/S6-02.md)** Review accessibility (`90m`, *Product*)<br>- **[S6-03](issues/S6-03.md)** Handle interrupted work (`90m`, *Platform agent*)<br>- **[S6-04](issues/S6-04.md)** Add operational visibility (`90m`, *Platform agent*)<br>- **[S6-05](issues/S6-05.md)** Rehearse recovery (`90m`, *Platform agent*)<br>- **[S6-06](issues/S6-06.md)** Run a release regression (`120m`, *Verification agent*)<br>- **[S7-01](issues/S7-01.md)** Define the paid offer (`60m`, *Coordinator*)<br>- **[S7-02](issues/S7-02.md)** Build the upgrade flow (`90m`, *Product*)<br>- **[S7-03](issues/S7-03.md)** Integrate hosted checkout (`120m`, *Platform agent*) ⚠️ *prereq*<br>- **[S7-04](issues/S7-04.md)** Verify payment events (`120m`, *Platform agent*)<br>- **[S7-05](issues/S7-05.md)** Add support fulfillment tracking (`90m`, *Platform agent*)<br>- **[S7-06](issues/S7-06.md)** Rehearse payment failures and refunds (`120m`, *Verification agent*)<br>- **[S8-01](issues/S8-01.md)** Define operational metrics (`60m`, *Coordinator*)<br>- **[S8-02](issues/S8-02.md)** Add a simple metrics view (`90m`, *Product*)<br>- **[S8-03](issues/S8-03.md)** Prepare release configuration (`90m`, *Platform agent*)<br>- **[S8-04](issues/S8-04.md)** Run acceptance checks (`120m`, *Verification agent*)<br>- **[S8-05](issues/S8-05.md)** Prepare support instructions (`90m`, *Coordinator*)<br>- **[S8-06](issues/S8-06.md)** Release and smoke-check (`60m`, *Platform agent*)<br>- **[S8-07](issues/S8-07.md)** Prioritize the next backlog (`90m`, *Coordinator*) | - **[S6-01](issues/S6-01.md)** Review mobile layouts (`90m`, *Product*) | *Empty* | *Empty* | - **[S1-01](issues/S1-01.md)** to **[S1-07](issues/S1-07.md)** (Sprint 1 Complete)<br>- **[S2-01](issues/S2-01.md)** to **[S2-08](issues/S2-08.md)** (Sprint 2 Complete)<br>- **[S3-01](issues/S3-01.md)** to **[S3-07](issues/S3-07.md)** (Sprint 3 Complete)<br>- **[S4-01](issues/S4-01.md)** Design customer/support roles<br>- **[S4-02](issues/S4-02.md)** Implement customer identity<br>- **[S4-03](issues/S4-03.md)** Enforce server authorization<br>- **[S4-04](issues/S4-04.md)** Build the support queue<br>- **[S4-05](issues/S4-05.md)** Add review notes and history<br>- **[S4-06](issues/S4-06.md)** Add deletion and retention behavior<br>- **[S4-07](issues/S4-07.md)** Verify access boundaries<br>- **[S5-01](issues/S5-01.md)** Define the model contract<br>- **[S5-02](issues/S5-02.md)** Connect the server-side provider<br>- **[S5-03](issues/S5-03.md)** Ground responses in case evidence<br>- **[S5-04](issues/S5-04.md)** Validate outputs and fallback<br>- **[S5-05](issues/S5-05.md)** Add usage controls<br>- **[S5-06](issues/S5-06.md)** Evaluate representative cases<br>- **[S5-07](issues/S5-07.md)** Update product language |

---

## Active Priority Queue (Sprint 6 Focus)

With **Sprints 1 through 5** completed and verified, execution advances to **Sprint 6 (Usability and service reliability)**:
1. **[S6-01](issues/S6-01.md)**: Review mobile layouts — 390px mobile viewport testing without overflow.
2. **[S6-02](issues/S6-02.md)**: Review accessibility — WCAG contrast, ARIA landmarks, and keyboard navigation.
3. **[S6-03](issues/S6-03.md)**: Handle interrupted work — save drafts in local session storage across reloads.

---

## Sprint Summaries

| Sprint | Status | Budget | Tasks | Done | Remaining |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [Sprint 1 — Foundation and application shell](sprints/S1-foundation.md) | `Complete` | ~10 hours (600m) | 7 | 7 | 0 min |
| [Sprint 2 — Guided case workflow](sprints/S2-guided-workflow.md) | `Complete` | ~11 hours (660m) | 8 | 8 | 0 min |
| [Sprint 3 — Evidence and measurable outcomes](sprints/S3-measurements.md) | `Complete` | ~10 hours (600m) | 7 | 7 | 0 min |
| [Sprint 4 — Customer accounts and support operations](sprints/S4-multiuser-accounts.md) | `Complete` | ~11 hours (660m) | 7 | 7 | 0 min |
| [Sprint 5 — Live AI explanations](sprints/S5-ai-integration.md) | `Complete` | ~10.5 hours (630m) | 7 | 7 | 0 min |
| [Sprint 6 — Usability and service reliability](sprints/S6-reliability.md) | `Ready` | ~9.5 hours (570m) | 6 | 0 | 570 min |
| [Sprint 7 — Paid assisted support](sprints/S7-paid-support.md) | `Not started` | ~10 hours (600m) | 6 | 0 | 600 min |
| [Sprint 8 — Release and next-sprint decisions](sprints/S8-release.md) | `Not started` | ~10 hours (600m) | 7 | 0 | 600 min |
| **Total** | — | **4920m (~82h)** | **55** | **36** | **1740m** |

---

## Operating Documents & Protocol
- 👥 **[Agent Roles & Ownership](ROLES.md)**: Clear file ownership and collision prevention rules.
- 📜 **[Living Handoff Log](HANDOFF.md)**: Session log updated between agent handoffs.
- 🎯 **[Final Release Checklist](RELEASE-CHECKLIST.md)**: 8-point customer readiness gate.
