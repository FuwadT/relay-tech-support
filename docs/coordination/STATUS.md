# Shared Relay status — October 15, 2026

Integration/release owner: Codex. AI/support implementation owner: Gemini. Read this file and your inbox before edits. Each agent uses its own checkout and dependency/runtime directories.

## Active branches

Current task: Codex is reviewing S6-02 on codex/accessibility-review, based on main73e5715. Hosted review and bounded interface proposals: ACCESSIBILITY-2026-10-15.md. New isolated measurement invariants bring unit coverage to 37 passing tests; TypeScript passes. App files are unchanged pending Gemini protocol acknowledgement. Remaining work includes agreed S6-03 idempotency and S8-02 metrics view. This brings forward the internal-demo subset of S8-03/S8-04 while S6-03 awaits shared API/schema agreement. Hosted version 3 is now ready for the owner-only demo; the updated-demo preparation estimate has been satisfied. Evidence: DEMO-RELEASE-2026-10-15.md. See ../DEMO.md. Use a separate Sites staging checkout at C:/Users/fuwad/Relay-demo; never replace Gemini's source or share dependency/runtime directories. No audience change is authorized.

- main: PR #5 documentation/metric definitions merged at 73e5715; PR #4 application merged at 6dd00e4 after CI 38786728384 passed on reviewed head 24562af. Private version 3 deployment succeeded; current owner-session measurements, reload, legacy-case compatibility and export checks pass. PR #3 and foundation PR #1 remain included.
- codex/guided-release, C:/Users/fuwad/Relay-codex: source is integrated into main. Validation passes 34 tests, TypeScript, build, recovery and 68 local HTTP assertions. Keyboard bypass/current-view announcements and deletion focus checks pass. Model adapter and AI UI are omitted; a disabled explanation handler consumes stale-client JSON and returns unsupported.
- codex/integration: draft PR #2 retains Gemini's AI work and independent safety tests. 40/42 unit tests pass; two provider-output safety checks fail. CI 38742689974 correctly fails. Do not deploy this branch.
- Gemini's checkpoint 90b6d5d remains in its own checkout C:/Users/fuwad/Relay. No new correction/acknowledgement to the latest review has been received.

## Scope and evidence

Codex owns diagnostics 1.0.2, independent verification, release selection, candidate-only focus/deletion corrections and coordination. Gemini retains AI provider/endpoint/limiter corrections and its support implementation. No schema, applied migration, auth or shared-contract changes were made to reduce the guided release scope. Coordinate a single owner before editing those shared areas.

Hosted version 3 now has real owner-sign-in, legacy-case compatibility, new case creation, measurements/save/reload, export redaction and focused keyboard evidence. Both-category answers/notes/escalation survived from version 2. The access policy contains only the owner and no external visitors/groups/editors; no audience change occurred. Three clearly labeled synthetic hosted QA cases remain. Two-user hosted isolation remains unverified; scoped owner-only demo acceptance passed.

Full report: STATUS-REPORT-2026-10-15.md. Historical integration evidence: INTEGRATION-2026-10-15.md. Recovery procedure: ../RECOVERY.md. AI fixes requested: TO-GEMINI.md.

## Pending contracts and next actions

S6-03 design: IDEMPOTENT-CREATE-PROPOSAL.md. Atomic owner-scoped reservations, changed-payload conflicts and deletion-aware retries require agreement before shared API/schema edits. No schema owner or migration number has been assigned for that proposal.

Next: complete remaining S6 accessibility and external-release gates; Gemini fixes AI output validation and durable limits from the current main baseline; agree duplicate-create implementation. Support policy now documents the actual broad-triage permissions without promising assignment-scoped enforcement. Hosted two-user authorization, D1 recovery, duplicate-create protection and remaining accessibility work block external release. GitHub again returned 403 for private branch protection under the account plan; keep review/CI practices explicit.

Current hosted evidence: DEMO-RELEASE-2026-10-15.md. S8-01 metrics definitions are complete in ../METRICS.md; no shared schema/contracts/auth changes are proposed. Gemini retains AI fixes and is asked to acknowledge the idempotency proposal.

## Parallel S6-03 assignment — October 15
Codex read Gemini's new section 6 in the integration checkout's TO-CODEX.md and acknowledges agreement to IDEMPOTENT-CREATE-PROPOSAL.md. Gemini owns UI/intake draft persistence, accessibility/CSS, metrics view and provider corrections. Codex owns the idempotent-create server/schema implementation and independent tests on isolated branches. Migration 0004 is reserved exclusively for Codex create-request reservations; Gemini must not allocate 0004 or edit these APIs/schema concurrently. No applied migration changes.

Frozen API increment: POST /api/cases accepts optional UUID Idempotency-Key (absent retains legacy behavior). New keyed request returns 201 with case and replayed:false; same owner/key/normalized payload returns 200 with same case ID and replayed:true; changed payload returns409; deleted associated case returns410, never recreated. Owner identity remains platform-only. Atomic reservation/case persistence must survive concurrent Worker requests and rollback together. Key/fingerprint hashes only; no hidden case content in reservation. Retention is explicit: request metadata has no automatic expiry for this private prototype, so old retry keys remain blocked after deletion; account-level metadata removal/retention policy remains an external-release gate. Do not claim a 30-day TTL or purge without a separately agreed design.

Gemini: generate one UUID per deliberate intake, send Idempotency-Key on create, preserve it and the submitted payload on ambiguous failure, and reset after confirmed success or deliberate new intake. Changed payload with an uncertain key must ask for an explicit new attempt rather than silently creating another case. Please read ACCESSIBILITY-2026-10-15.md for the three bounded interface fixes. Do not overwrite the coordinator's STATUS while delivering changes; send commit IDs in TO-CODEX.md. Main includes PR6 at5a8593f (37 unit tests). Keep AI disabled until review.
