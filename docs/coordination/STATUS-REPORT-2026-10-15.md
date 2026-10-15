# Relay status report — October 15, 2026

## Current result

Guided-only candidate: codex/guided-release, implementation commits 1cad265 and 619d19f, [draft PR #3](https://github.com/FuwadT/relay-tech-support/pull/3). CI run 38743813212 passes. Foundation PR #1 is merged into main at 427d497. No deployment was performed in this session.

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

Before external customer release: verify two real identities and hosted header stripping/session expiry, settle support assignment policy, demonstrate D1 recovery/backup expiry/deletion replay, finish accessibility review, and implement durable duplicate-create protection. The idempotency proposal is in IDEMPOTENT-CREATE-PROPOSAL.md and awaits shared owner agreement. Live AI additionally needs safe schema/evidence validation, durable request/cost limits, concurrency protection and provider acceptance.

## Next three tasks and ownership

1. Codex/integration: review guided PR #3 independently of live AI and complete candidate-specific hosted acceptance through the approved release workflow.
2. Gemini: acknowledge TO-GEMINI.md, fix the mocked-provider failures on its AI branch and send focused commits; retain diagnostics 1.0.2 and the deletion/focus improvements where applicable.
3. Platform/interface owners: agree the S6-03 idempotency contract and schema ownership, then implement atomic retries and verify race/failure/deletion cases.

GitHub branch protection remains unavailable under the repository's current plan. PRs and CI are in place, but they do not enforce merge restrictions by themselves. The latest quota snapshot in chat showed 65% of the five-hour allowance remaining; this report is a saved checkpoint before ending work, not an exhaustion notice.
