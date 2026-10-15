# Shared Relay status — October 15, 2026

Integration/release owner: Codex. AI/support implementation owner: Gemini. Read this file and your inbox before edits. Each agent uses its own checkout and dependency/runtime directories.

## Active branches

Current task: Codex is preparing an updated owner-only demo from reviewed guided source on codex/demo-readiness. This brings forward the internal-demo subset of S8-03/S8-04 while S6-03 awaits shared API/schema agreement. Hosted version 3 is now ready for the owner-only demo; the updated-demo preparation estimate has been satisfied. Evidence: DEMO-RELEASE-2026-10-15.md. See ../DEMO.md. Use a separate Sites staging checkout at C:/Users/fuwad/Relay-demo; never replace Gemini's source or share dependency/runtime directories. No audience change is authorized.

- main: PR #4 merged at 6dd00e4 after CI 38786728384 passed on reviewed head 24562af. Private version 3 deployment succeeded; current owner-session measurements, reload, legacy-case compatibility and export checks pass. PR #3 and foundation PR #1 remain included.
- codex/guided-release, C:/Users/fuwad/Relay-codex: source is integrated into main. Validation passes 34 tests, TypeScript, build, recovery and 68 local HTTP assertions. Keyboard bypass/current-view announcements and deletion focus checks pass. Model adapter and AI UI are omitted; a disabled explanation handler consumes stale-client JSON and returns unsupported.
- codex/integration: draft PR #2 retains Gemini's AI work and independent safety tests. 40/42 unit tests pass; two provider-output safety checks fail. CI 38742689974 correctly fails. Do not deploy this branch.
- Gemini's checkpoint 90b6d5d remains in its own checkout C:/Users/fuwad/Relay. No new correction/acknowledgement to the latest review has been received.

## Scope and evidence

Codex owns diagnostics 1.0.2, independent verification, release selection, candidate-only focus/deletion corrections and coordination. Gemini retains AI provider/endpoint/limiter corrections and its support implementation. No schema, applied migration, auth or shared-contract changes were made to reduce the guided release scope. Coordinate a single owner before editing those shared areas.

The existing hosted version 2 now has real owner-sign-in and both-category save/reload evidence, including notes, four answers, escalation and export redaction. It is an older release, not the new candidate. The access policy contains only the owner and no external visitors/groups/editors; no audience change occurred. Two clearly labeled synthetic hosted QA cases remain. Two-user isolation and candidate-specific hosted acceptance are still unverified.

Full report: STATUS-REPORT-2026-10-15.md. Historical integration evidence: INTEGRATION-2026-10-15.md. Recovery procedure: ../RECOVERY.md. AI fixes requested: TO-GEMINI.md.

## Pending contracts and next actions

S6-03 design: IDEMPOTENT-CREATE-PROPOSAL.md. Atomic owner-scoped reservations, changed-payload conflicts and deletion-aware retries require agreement before shared API/schema edits. No schema owner or migration number has been assigned for that proposal.

Next: complete remaining S6 accessibility and external-release gates; Gemini fixes AI output validation and durable limits from the current main baseline; agree duplicate-create implementation. Support policy now documents the actual broad-triage permissions without promising assignment-scoped enforcement. Hosted two-user authorization, D1 recovery, duplicate-create protection and remaining accessibility work block external release. GitHub again returned 403 for private branch protection under the account plan; keep review/CI practices explicit.

Current hosted evidence supersedes the older version-2-only paragraph above: see DEMO-RELEASE-2026-10-15.md. Codex owns the next documentation-only S8-01 metrics definition; no shared schema/contracts/auth changes are proposed. Gemini retains AI fixes and is asked to acknowledge the idempotency proposal.

