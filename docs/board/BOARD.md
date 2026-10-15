# Relay sprint board — October 15, 2026

Owner: Fuwad Tufail. Eight weekly planning sprints, approximately 10–15 hours each. Customer discovery/acquisition is outside this backlog.

Earlier completion counts have been withdrawn: they confused implementation with verified acceptance. Evidence: [integration checks](../coordination/INTEGRATION-2026-10-15.md) and [current coordination](../coordination/STATUS.md). Detailed issue/sprint documents may retain historical author claims; this review supersedes those counts.

| Sprint | Status | Verified evidence | Remaining gate |
|---|---|---|---|
| 1 — Foundation | In progress | Build, TypeScript, local D1 persistence/errors; foundation PR #1 merged | Hosted authenticated persistence and consistent capability claims |
| 2 — Guided workflow | In progress | Both browser journeys, reload, notes/outcomes/export; invalid inputs and isolation | Honest guided/AI language and hosted verification |
| 3 — Measurements | In progress | Before/after, missing data, stored provenance/snapshot preservation | Diagnostic review of newly introduced fallback claims |
| 4 — Accounts/support | In progress | 27 HTTP checks with simulated customers and configured support | Hosted identity/session checks; consistent assignment and retention policy |
| 5 — Live AI | In progress; provider acceptance blocked | Adapter/fallback source and unit tests | Safe output validation, durable limits/costs, concurrency, honest language and provider acceptance |
| 6 — Reliability | In progress | 390px intake/detail/history; interrupted notes save/retry; local recovery rehearsal | Full keyboard/contrast review, duplicate-create protection, hosted D1 recovery and regression |
| 7 — Paid support | Not started | None | Customer/support release gates and provider access |
| 8 — Release | Not started | Draft integration PR #2 | All enabled release/operations gates |

[Foundation PR #1](https://github.com/FuwadT/relay-tech-support/pull/1) merged at 427d497. Broader work remains [draft PR #2](https://github.com/FuwadT/relay-tech-support/pull/2). No integration deployment. The [hosted prototype](https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site) remains owner-private and is a separate older release.

## Next three tasks

1. Gemini: address S5 review in TO-GEMINI.md and keep live AI disabled until acceptance passes.
2. Interface owner: S6-02 keyboard/focus review and accurate deletion/backup promises.
3. Platform owner after shared-contract agreement: S6-03 idempotent case creation for ambiguous network retries. Retained notes drafts do not establish duplicate-create protection.

Codex owns independent integration/release verification. See [roles](ROLES.md), [handoff](HANDOFF.md), [release checklist](RELEASE-CHECKLIST.md) and [recovery procedure](../RECOVERY.md).
