# S6-03 proposal: retry case creation without duplicates

Status: design proposal, not implemented. Coordinator: Codex. API/schema/interface owners must acknowledge in STATUS.md before shared edits. This does not change the current API contract.

The current busy button prevents concurrent clicks in one screen. It cannot handle a successful server insert whose response is lost: a retry can create another case. The observed notes-save recovery does not satisfy this separate creation requirement.

## Proposed behavior

- The client generates one random UUID `Idempotency-Key` per intake attempt and retains it through uncertain failures and retries. Reset only after a definitive successful response or a deliberate new intake. The key grants no identity or role; owner identity still comes from verified platform dispatch.
- The server validates a bounded body and the key format, normalizes intake with existing validation, and computes a stable payload fingerprint. All key lookup and replay operations are scoped to the verified owner.
- The database atomically reserves `(owner, key hash)` and creates the case in the same transaction/batch. A unique constraint is necessary; a process-local map or select-then-insert is insufficient across Worker instances.
- A repeated key with identical normalized intake returns the same case ID and a replay indicator. A reused key with different intake returns a controlled 409. A key held by another owner cannot expose their record.
- If the associated case was deleted, a retry returns a controlled deleted-request response and cannot recreate the deleted case. Keep only the minimal request metadata needed for this behavior, without copying descriptions, answers or notes into a hidden retained case record. Retention for that metadata must be documented.
- Unexpected failure rolls back the reservation and insertion together. A reservation must never falsely indicate success when no case exists. Define recovery for a reservation left by a platform failure before release.

Do not derive case IDs solely from the key without a retained request record: after deletion the same retry could recreate the case, and changed payload reuse needs explicit handling. Do not add a migration number until Gemini's AI-usage schema proposal and this proposal have one assigned schema owner.

## Verification required

1. Send two concurrent identical requests with the same owner/key: one stored case, same returned case ID.
2. Simulate response loss after commit, retry with the same key: no second case.
3. Use the same key with different payload: 409; original case unchanged.
4. Use the same key under another identity: no cross-owner read/replay.
5. Delete the case, then repeat the old request: controlled result, no resurrection.
6. Inject a database failure during creation: no orphan reservation or false success; retry recovers.
7. Check expired requests and agreed retention semantics, invalid key/body, and client key retention through a recoverable error. Disable duplicate clicks independently of server idempotency.

## Estimate and sequencing

The original 90-minute issue needs reassessment for durable cross-instance creation. Proposed small issues: contract/lifecycle agreement (30 minutes), server reservation/migration (60 minutes), client retry handling (60 minutes), and race/failure verification (30 minutes). Total 180 minutes. This exceeds the original estimate by 90 minutes; move unfinished reliability work forward rather than silently expanding the sprint budget. No parent acceptance item is complete from this document alone.
