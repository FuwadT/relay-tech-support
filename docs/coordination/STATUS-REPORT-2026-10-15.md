# Relay status report — October 15, 2026

## Current result

Guided-only source is merged into main through [PR #3](https://github.com/FuwadT/relay-tech-support/pull/3), merge 62c6d21. Reviewed head 743ef84 passed CI run 38745792833, including keyboard changes. Implementation includes 1cad265 and 619d19f; foundation PR #1 remains included. No deployment was performed in this session; source integration is a separate milestone from a hosted release.

The candidate retains guided checks, saved history/answers/notes/outcomes, optional measurements and historical provenance. It omits the live model adapter and AI assessment UI. Stale AI requests receive a controlled unsupported response. New diagnostics 1.0.2 preserve small changes, ignore invalid historical evidence and prompt reconciliation of conflicting resource observations. Deletion language acknowledges backups; confirmation focuses Keep case and Escape restores Delete case focus.

## Verified evidence

- Guided candidate: 34 unit tests, strict TypeScript and production build pass.
- Built local Worker: 41 journey HTTP assertions plus 27 configured-support access assertions pass (68 total), including the unsupported-AI response followed by ordinary requests. API fixtures removed.
- SQLite recovery rehearsal: migrations 0000–0003, snapshot chain/columns, backup contents, integrity, owner index and deletion limitation pass. No applied migrations were changed.
- Focused browser checks on candidate: case creation works; no AI assessment panel; corrected deletion text, initial safe focus and Escape restoration work. Earlier full journeys/mobile checks remain tied to their integration checkpoint.
- EXISTING HOSTED RELEASE: Sites reports active version 2. Real ChatGPT owner sign-in completed, then slowdown and connectivity fixtures each saved four answers and notes and persisted after reload. Connectivity escalation persisted. Unknown/not-tried selections persisted. Missing case URL displayed controlled Case not found JSON. Downloaded connectivity export preserves four answers/outcome and excludes userId, consentAt and internalNotes. This does NOT validate PR #3's newer hosted code.
- Hosted access policy: custom policy containing only the signed-in owner, zero external visitors/groups/editors. Audience and permissions were not changed.

Hosted fixtures retained: QA hosted slowdown — synthetic Oct 15; QA hosted connectivity — synthetic Oct 15. Both explicitly state they are acceptance fixtures, not customer problems or real repairs. No hosted deletion was performed. Local synthetic browser fixtures also remain in the isolated local database.

## AI review and remaining work

codex/integration / [draft PR #2](https://github.com/FuwadT/relay-tech-support/pull/2) preserves Gemini's AI implementation. Its mocked-provider release checks reproduce unsafe prose and malformed schema accepted as live output: 40 of 42 unit tests pass, two fail. CI run 38742689974 fails those safety checks. No credentials or paid model calls were used. Do not merge or deploy that branch until corrected.

Before external customer release: verify two real identities and hosted header stripping/session expiry, demonstrate D1 recovery/backup expiry/deletion replay, finish accessibility review, and implement durable duplicate-create protection. Support policy now describes the implemented broad-triage access; assignment is not an enforced access boundary. The idempotency proposal is in IDEMPOTENT-CREATE-PROPOSAL.md and awaits shared owner agreement. Live AI additionally needs safe schema/evidence validation, durable request/cost limits, concurrency protection and provider acceptance.

## Next three tasks and ownership

Additional keyboard improvement verified after this report's initial commit: first Tab focuses Skip to main content; Enter focuses MAIN. Deletion cancellation focus checks also pass. The current view is exposed with aria-current. TypeScript and production build pass after these UI changes. Backend and migration code are unchanged by this final accessibility increment. S6-02 remains in progress for a full screen/contrast review.

1. Codex/integration: complete candidate-specific hosted acceptance through the approved release workflow; current source is merged but not deployed.
2. Gemini: acknowledge TO-GEMINI.md, fix the mocked-provider failures on its AI branch and send focused commits; retain diagnostics 1.0.2 and the deletion/focus improvements where applicable.
3. Platform/interface owners: agree the S6-03 idempotency contract and schema ownership, then implement atomic retries and verify race/failure/deletion cases.

GitHub branch protection remains unavailable under the repository's current plan. PRs and CI are in place, but they do not enforce merge restrictions by themselves. The latest quota snapshot in chat showed 65% of the five-hour allowance remaining; this report is a saved checkpoint before ending work, not an exhaustion notice.

## Updated owner-only demo released
PR #4 merged at 6dd00e4; CI 38786728384 passed. Sites version 3 deployed successfully on October 15. Current owner-session case creation, measurements/save/reload, legacy-case compatibility, export redaction and focused keyboard checks pass. See DEMO-RELEASE-2026-10-15.md for exact source, version, deployment IDs and limits. Earlier no-deployment/version-2 statements describe the previous checkpoint. The scoped guided demo is ready now; external release remains held.


S8-01 is complete as documentation: docs/METRICS.md specifies all requested metric denominators, unknowns, coverage and worked examples. Dashboard S8-02 remains pending. The internal demo needs no further development time; customer pilot readiness has no defensible date until identity, reliability and recovery gates pass. Next three tasks: S6-02 full keyboard review; shared agreement and implementation of S6-03; S8-02 labeled owner-workspace metrics. No payment/model enablement is included.

