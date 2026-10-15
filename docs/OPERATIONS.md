# Relay private demo operations guide

Owner: Fuwad Tufail. Prepared October 15, 2026 for the guided-only, owner-private demo. This is the S8-05 operating-guide deliverable in draft; acceptance and external-release prerequisites remain pending.

## Check the release before a demonstration

Use the URL and walkthrough in [DEMO.md](DEMO.md). Hosted version 3 has owner-session workflow evidence. A GitHub commit, passing build or newer source branch does not establish that its changes are deployed. Record the hosted version, source commit and verification evidence before describing a feature as live. Keep the existing owner-only audience; this guide does not authorize customer invitations or support grants.

The candidate reliability source adds keyed creation retries and classified failure logs, described below. Those additions are not verified as deployed on version 3. Check the integration handoff and deployment evidence before relying on them during a demo.

## Start a supported case

Confirm that the device is personally owned and runs Windows 11. Supported journeys are computer slowdown and unreliable home connectivity. Stop unsupported managed-device or other operating-system intake rather than inventing a supported workflow. Never request passwords, remote desktop access, diagnostic files or screenshots through this prototype.

Enter a clear title, symptom description, recognizable device name and category. Explain that saving requires consent and stores the case. Use clearly labeled synthetic examples for demonstrations; do not present fixture counts as customer results. Relay does not scan the device, collect background readings or repair it automatically.

Follow the four guided checks one at a time. Save the observed answer; use offered unknown/not-tried options honestly. An unanswered check remains pending. Optional baseline and follow-up values are user-entered readings: record the displayed units and repeat under comparable conditions. Missing values remain unknown, not zero. Reopen the saved case to confirm persistence before reporting success.

## Read and review the result

Use [DIAGNOSTIC_WORKFLOW.md](DIAGNOSTIC_WORKFLOW.md) to separate reported observations, possible explanations and reported outcomes. Check the evidence and saved rule version. Historical saved plans need not match the latest rules. When the legacy-plan notice appears, current guidance has been calculated because an earlier plan was not saved; do not call it the original historical recommendation.

Before/after improvement does not prove the suggested action caused it. Resolved means a reported outcome; `verifiedAt` is not independent repair verification. Staff handling status is shared with the case status and is not a substitute for attributable customer-report history. See [METRICS.md](METRICS.md) before quoting any rate: retained synthetic records cannot establish customer success, handling time or all-time performance.

For an unresolved case, check missing answers and whether contradictory readings describe the same workload and time. Ask for a comparable observation before narrowing an explanation. Record relevant notes without secrets. If the approved checks are insufficient, save Escalated / Needs a technician and explain that this only records the decision: it sends no message, books no appointment and contacts nobody. Do not promise a technician, response deadline or universal fix. Physical damage, managed devices or work beyond the supported observations require the owner to arrange appropriate assistance separately.

## Recover from a failed save

If the interface reports failure, retain the draft and inspect saved history before assuming nothing was written. Do not report successful saving from a spinner or a completed build. Reopen the case after a confirmed save. Avoid parallel edits of the same case from multiple devices; atomic multi-device editing remains unfinished.

In the newer reliability source, a deliberate intake can use an optional UUID `Idempotency-Key`. Repeating the same owner/key and normalized payload returns the same saved case: the first creation is HTTP 201 and a replay is HTTP 200. HTTP 409 means that key was already used with different details; HTTP 410 means its associated case was deleted. Neither response should trigger a silent new case. Preserve the original key and submitted details after an ambiguous failure. An explicit new attempt is required when deliberately submitting changed details or replacing a deleted case. Legacy requests without a key retain ordinary creation behavior; do not claim duplicate protection for them or for hosted version 3 without release evidence.

The private prototype's reservation metadata has no automatic expiry. It stores owner-linked key/fingerprint hashes and case references, not an extra copy of the intake text. Deleting a case does not remove its reservation or permit that retry key to recreate it. Account-level metadata removal and retention rules remain external-release work; do not promise a 30-day purge.

For an unexpected failure, record the displayed reference, operation attempted, approximate time and release version in a restricted incident record. Do not copy case descriptions, notes, credentials, raw SQL or database files into general logs or public issues. The reliability source logs `case_operation_failed` with the matching `requestId`, an allowlisted operation (such as `create_case`) and a coarse `failureType`. These identify the operation and broad error class, not the root cause; investigate using controlled reproduction. Never enable raw exception/SQL logging to make the reference more detailed.

## Read, export and delete

The normal workspace is scoped to the signed-in owner's cases. [ACCESS-POLICY.md](ACCESS-POLICY.md) describes the separate server-controlled support paths and current restrictions; their presence in source does not enable cross-customer operations on the owner-private demo. A browser cookie, role header or assignment label cannot grant support access. Do not change access during an incident to bypass a failed permission check.

Export only the intended case and handle the downloaded JSON as private case data. Customer payloads and UI exports exclude internal notes. Confirm the selected case and downloaded contents before sharing anything; this guide authorizes no external sending.

Before deletion, confirm the selected case and explain that deleting removes its active saved answers, measurements and notes. Existing backups may retain older copies. Do not describe the success message as proof that every backup or linked retry reservation was erased. After confirmation, check that the case is absent from history and cannot be reopened. An older backup can resurrect a deleted record unless deletion replay is addressed. Follow [RECOVERY.md](RECOVERY.md); hosted expiry, restoration and deletion replay remain unverified release gates.

## Incidents and release holds

If another owner's records appear, internal notes reach a customer payload, a save falsely reports success, or a migration/recovery check fails, hold the release and stop the affected demonstration or workflow. Record minimal reproduction steps and the reference/version. Preserve evidence privately, notify the integration owner through the agreed coordination process, and do not publish the moving shared checkout. Do not promise a recovery point or restore production from an unverified local backup. The recovery guide requires migration, integrity, authorization and deletion checks before cutover.

External customer release stays held until real hosted identity/session boundaries, recovery/retention, accessibility and enabled-feature acceptance gates pass. Local simulated identities do not establish hosted two-user isolation. Before a later deployment, review the candidate diff, run its meaningful checks, apply only pending immutable migrations through the supported hosting workflow and smoke-check the actual deployed release.

Live model calls and paid assisted support are not enabled in this demo. Explain results as guided recommendations. Do not enter provider secrets into the browser, promise payment handling, accept charges through this product or describe refund processing as available. A future paid offer needs agreed service terms, provider verification and fulfillment operations before those promises can be made.
