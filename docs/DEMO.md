# Relay owner-only demo

Working task: S8-03/S8-04 internal demo preparation and acceptance, alongside Sprint 6 reliability. This does not complete Sprint 8 or authorize an external customer release.

The existing hosted version 2 is already usable for a guided workflow demo. The newer source adds optional before/after measurements, saved rule provenance and keyboard improvements. Initial estimate for preparing and verifying the updated owner-only hosted demo: 1–3 focused hours, subject to source packaging, hosted migrations and smoke checks. Update that estimate from observed results rather than treating it as a deadline.

## Demo scope

Personal Windows 11 slowdown and home connectivity; manual intake; four guided checks per category; saved answers, notes and outcomes; optional self-reported measurements; JSON export. No model calls, scanning, remote access, automated repair, uploads, payments or customer/support operations are promised. Keep the Site's single-owner allowlist unchanged.

## Six-minute walkthrough

1. Explain that Relay organizes observations and suggests approved manual checks. It does not inspect the device. Show the Windows 11/personal-device boundary and storage consent.
2. Create `Demo — performance — synthetic` with a fictional laptop and a note that all entered values are illustrative test data. Select a scope observation, then work through Task Manager, storage and restart questions. Use unknown or not-tried where appropriate; explain that these are saved answers rather than measurements or proof of a cause.
3. Enter illustrative app-launch values of 20 seconds before and 12 seconds after. Show units, comparable-condition instructions, the difference and the warning that a change does not prove causation. Show an unrecorded metric remaining unknown.
4. Add a note, leave the case and reopen it after a reload. Confirm answers and measurements remain. Export the case and show that it contains the observations and saved rule version.
5. Show a connectivity case and the cross-device/location/background-activity/service checks. Record escalation as a next step; explain that this does not contact a technician. Any resolved demo case must be clearly identified as a synthetic test, not a real customer result.
6. Summarize the recorded observations and remaining uncertainty. Keep live AI and paid support out of the demo. Open the current limitations if asked about customer readiness.

Do not delete the existing hosted QA cases during the walkthrough without an intentional cleanup step. They are explicitly synthetic, not customer results. Deletion removes the active record; backups may retain older copies.

## Updated-demo gate

- Reviewed guided source and known limitations recorded in GitHub.
- Build, strict TypeScript, 34 tests, local migration/recovery checks and 68 HTTP assertions pass on the selected source.
- Hosting project and effective single-owner access policy confirmed; no role grants or audience changes.
- Applied migrations remain immutable; only pending schema additions are published through Sites.
- Saved source/archive/hosted version identifiers recorded separately from the GitHub commit.
- Deployment succeeds, then the real owner creates, saves and reloads a case with measurements on the new version. Reopen one earlier case to check migration compatibility.
- Mobile overflow and keyboard skip/deletion focus checks remain usable on the new hosted version.

Until the final hosted checks pass, use the existing version 2 for the basic guided demo or the verified local build for the newer measurements. Do not describe the newest GitHub source as deployed.

## Remaining after an internal demo

External pilot gates include two real identities and hosted trust-header/session checks, durable duplicate-create protection, full accessibility review, D1 recovery/backup expiry/deletion replay and any staffed support commitments. Live AI remains separately blocked by provider-output safety and durable usage controls. S6-03 requires the shared idempotency proposal to be agreed before API/schema edits.
