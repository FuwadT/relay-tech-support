# Database migration and recovery rehearsal

Owner: integration/release operator. Last local rehearsal: October 15, 2026.

Run `node scripts/verify-recovery.mjs` with Node 24 from the repository root. It creates a uniquely named directory under ignored `.sites-runtime/`, opens only synthetic SQLite databases, applies the migration journal in order, compares each schema with its metadata snapshot, and checks a backed-up case including saved measurements and diagnostic provenance. It verifies SQLite integrity, foreign keys and the owner index. It leaves the files locally for inspection and never opens the application database.

The rehearsal also deletes the synthetic case and verifies that a newer backup omits it while the older backup retains it. That is a demonstrated limitation: restoring an old backup can resurrect data deleted since that backup. Production deletion replay and backup expiry are not implemented. Customer retention promises must account for this before customer access.

## Before a release migration

1. Identify the deployed commit, target database, applied migration ledger and exact next migration files. Do not infer applied state from files in Git. Never rerun raw SQL against an existing database unless its applied state is known.
2. Run the local rehearsal and the release build's workflow/access checks. Inspect the generated migration metadata alongside the SQL. Applied migrations remain immutable; corrections use a new migration.
3. Obtain a recoverable database backup or provider recovery point and record its identifier, time, migration level and access owner in a private operations log. Establish the provider's actual retention period and restore method before release. Neither is configured or verified by this local exercise.
4. Pause writes for a cutover that cannot preserve concurrent changes. Apply only pending migrations with the deployment platform's migration operation. Record the result. Do not invoke local Wrangler commands as a production migration method.

## Rollback and restore

For an application failure after an additive migration, first roll back the application artifact if the previous version can read the expanded schema. The migrations through 0003 add columns without removing old columns; that compatibility is a source review observation, not a production rollback rehearsal. Do not drop columns or reverse migrations against customer data as a first response.

For a database failure, restore into a separate nonproduction target first. Confirm migration level, row counts, owner fields, saved answers, measurements, notes, internal-note filtering and historical analysis. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` where supported. Test at least two customer identities and one explicitly granted support identity against that target. Reconcile writes and deletions after the recovery point; an old backup is not a complete current state.

Switch the application to a restored target only after those checks pass, deletion replay is addressed, and the operator records the acceptable recovery point. Preserve the failed target for investigation under the retention policy. Verify a real authorized create/read/update/delete journey after cutover.

## Evidence and remaining gate

The October 15 local rehearsal passed migrations 0000–0003, snapshot chain/column comparisons, exact case backup recovery, integrity checks, the owner index and deletion behavior. It uses Node's SQLite backup API and synthetic data. The integrated Cloudflare Worker separately passed 35 workflow and 27 access HTTP assertions after local D1 migrations 0001–0003 were applied to a known 0000 database.

Hosted D1 backup/restore, actual recovery objectives, backup expiry, deletion replay and a production rollback have not been demonstrated. S6-05 is in progress until the deployment-specific recovery procedure has been exercised on a nonproduction D1 target. External customer release remains held.
