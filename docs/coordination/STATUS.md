# Shared Relay status — October 15, 2026

Integration/release owner: Codex. AI/support implementation owner: Gemini. Read this file and your inbox before edits. Each agent uses its own checkout and dependency/runtime directories.

## Active branches

- main: foundation PR #1 merged at 427d497; no new deployment.
- codex/guided-release, C:/Users/fuwad/Relay-codex: guided-only candidate, draft PR #3. Implementation 619d19f. CI 38743813212 passes 34 tests, TypeScript, build, recovery and 68 local HTTP assertions. Model adapter and AI UI are omitted; a disabled explanation handler consumes stale-client JSON and returns unsupported.
- codex/integration: draft PR #2 retains Gemini's AI work and independent safety tests. 40/42 unit tests pass; two provider-output safety checks fail. CI 38742689974 correctly fails. Do not deploy this branch.
- Gemini's checkpoint 90b6d5d remains in its own checkout C:/Users/fuwad/Relay. No new correction/acknowledgement to the latest review has been received.

## Scope and evidence

Codex owns diagnostics 1.0.2, independent verification, release selection, candidate-only focus/deletion corrections and coordination. Gemini retains AI provider/endpoint/limiter corrections and its support implementation. No schema, applied migration, auth or shared-contract changes were made to reduce the guided release scope. Coordinate a single owner before editing those shared areas.

The existing hosted version 2 now has real owner-sign-in and both-category save/reload evidence, including notes, four answers, escalation and export redaction. It is an older release, not the new candidate. The access policy contains only the owner and no external visitors/groups/editors; no audience change occurred. Two clearly labeled synthetic hosted QA cases remain. Two-user isolation and candidate-specific hosted acceptance are still unverified.

Full report: STATUS-REPORT-2026-10-15.md. Historical integration evidence: INTEGRATION-2026-10-15.md. Recovery procedure: ../RECOVERY.md. AI fixes requested: TO-GEMINI.md.

## Pending contracts and next actions

S6-03 design: IDEMPOTENT-CREATE-PROPOSAL.md. Atomic owner-scoped reservations, changed-payload conflicts and deletion-aware retries require agreement before shared API/schema edits. No schema owner or migration number has been assigned for that proposal.

Next: independently review guided PR #3; Gemini fixes AI output validation and durable limits; agree duplicate-create implementation. Hosted two-user authorization, assignment policy, D1 recovery and remaining accessibility work block external release. GitHub plan prevents enforced private branch protection; keep review/CI practices explicit.
