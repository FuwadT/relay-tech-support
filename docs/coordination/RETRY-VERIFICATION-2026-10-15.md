# S6 reliability integration — October 15

Branch: codex/reliability-integration. Source includes reviewed server c56e40e, safe-operation labels bc2406c, independent tests f11830a/df13832, and coordinator failure classification/recovery changes. This report describes local evidence, not a deployment.

## Implemented and checked

- POST /api/cases optionally accepts a UUID Idempotency-Key. Legacy unkeyed clients remain supported. A keyed create returns 201/replayed:false; normalized identical replay returns 200/replayed:true and the original case ID. Changed payload returns409; deleted original case returns410 without resurrection. Owner identity remains Sites-only; keys grant no access.
- New migration0004 adds only the request reservation table and new snapshot/journal entry. Applied0000–0003 remain unchanged. Hash-only request metadata has no automatic expiry; no case text is duplicated into reservations. Account-level metadata removal/bounded retention is still an external release gate.
- One transactional D1 batch inserts the reservation with unique owner/key constraint, conditionally inserts the winning case, and reads the owner-scoped result. No process-local reservation or select-then-insert shortcut.
- 43 unit tests pass. Independent SQLite tests execute the actual generated production SQL, inject a failing insert, verify rollback/no orphan reservation and successful same-key retry, and cover winner/conflict/deletion/cross-owner behavior.
- Strict TypeScript and production build pass. Full migration-chain rehearsal passes0000–0004; it now compares all table metadata and verifies retry tombstones survive deletion and post-deletion backup.
- Built local Worker with explicit synthetic support grant passes44 retry HTTP checks plus41 journey and27 access checks (112 total), including six concurrent requests yielding exactly one case, upper-case UUID normalization, normalized intake replay, response-loss-equivalent retransmission, payload conflicts, invalid keys/body/consent, cross-owner isolation, deletion410 and old unkeyed behavior. Owned case fixtures are removed; minimal request tombstones intentionally remain in disposable local D1.

The replay test retransmits after a successful request; it is not a real dropped-network/UI retry test. Client key retention, interrupted browser create and hosted migrations/identity tests remain pending. S6-03 stays in progress until client/browser acceptance passes.

## S6-04 operational visibility

Failure logs now contain only event, random requestId, allowlisted operation and safe failureType. They never include raw exception messages, names, SQL, parameters or case content. Customer500 responses retain the same recoverable message/reference. Expected validation errors return400 without creating a server-failure event.

Actual failure rehearsal: launched the built Worker against a separate empty local database on port8791. Submitted a synthetic keyed create containing a private sentinel. It returned controlled500 with reference `30de9688-2958-4e28-aa5f-45d3e378a132`. The matching log identified create_case/unexpected_error and excluded the sentinel, SQL and table details. Unit tests additionally check hostile error content, every supported failure category and unknown operation sanitization. This satisfies the local failed-save correlation check; it is not production monitoring or an alerting SLA. Both owned Worker processes were stopped after verification.

## Still held

Gemini owns client retries, draft preservation, accessibility/CSS, metrics view and provider corrections. No unreviewed Gemini files were committed. AI remains disabled in this integration branch; do not merge AI work merely because its parser tests pass. Hosted two-real-user/session/header verification, D1 recovery/deletion replay, full accessibility and support operations remain external-release gates. Version3 remains the last deployed private demo.
