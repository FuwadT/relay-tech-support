# Operational metrics contract — S8-01

Owner: Codex (integration), October 15, 2026. This defines reporting; it does not add telemetry, change storage contracts or enable customer access.

## Population and reporting window

Every view must state its scope (signed-in owner's cases, or an authorized support population), reporting window, timezone, cutoff and exclusions. Default cohort: retained eligible personal Windows 11 cases created in `[start, end)` UTC, evaluated at the displayed cutoff. Count distinct case IDs once. Do not mix current-state snapshots with lifetime event rates.

The existing database has no reliable test/demo flag. Titles are not authoritative classification. For the present owner-only demo, label every aggregate **Demo workspace — synthetic cases; not customer results**. External customer rates remain unavailable until a server-controlled population distinction is agreed and implemented. Never infer real customers from an email address, a title lacking “QA”, or a nonzero count.

Deleted cases are absent from the current database. Until deletion-aware aggregate accounting is agreed, label retained-record statistics as such; do not claim all-time acquisition, historical completion or retention rates. Do not retain private deleted case content merely for analytics.

## Definitions

| Metric and display label | Numerator / aggregate | Denominator / eligible records | Unknowns and limitations |
|---|---|---|---|
| Guided checklist completion | Distinct cohort cases with a recognized saved answer for every approved check in their category | All retained cases in the stated cohort | Offered unknown/not-tried selections count as answered, but not usable diagnostic evidence. Unanswered or invalid historical options are pending. This measures workflow entry, not repair. |
| Usable observation coverage | Approved checks with recognized, usable observations | Total approved checks across cohort cases | Unknown/not-tried remain answered but are excluded from this numerator. Use the selected rule version's vocabulary; show unavailable if historical check definitions cannot be recovered. |
| Currently marked resolved | Cohort cases whose current status is resolved | All retained cohort cases, including pending/escalated/closed | Current state only. Closed is not resolved. Do not call it independently verified or AI success. Support may modify status, so current storage cannot establish who reported it. |
| Customer-reported resolution rate (future) | Cases with an attributable customer resolution report as of cutoff | All eligible cohort cases; separately show reports received / all cases | Unavailable today: status and verifiedAt lack actor/event history. Do not substitute current resolved count or omit pending cases to improve the rate. A later reversal must remain visible. |
| Currently escalated | Cohort cases whose current status is escalated | All retained cohort cases | A saved status does not contact a technician. A resolved case is not currently escalated even if escalatedAt exists. |
| Ever escalated (future) | Cohort cases with a recorded escalation event before cutoff | All eligible cohort cases | Unavailable until event-history semantics are verified; escalatedAt alone is not a complete history. |
| Measured improvement, per metric | Cases with valid comparable before/after pairs whose direction is improved | Cases with valid comparable pairs for that metric | Show eligible-pair count / cohort count alongside the percentage. Null, missing, invalid or unmatched values are excluded, never zero. Measurement is self-reported and does not prove causation or resolution. No combined score across units. |
| Active handling time, median minutes (future) | Median of recorded active support durations, after excluding overlapping/invalid intervals | Cases with at least one complete valid timed support interval; show coverage against all cohort cases | Unavailable today. updatedAt minus createdAt is elapsed calendar time, not time spent. Unfinished intervals remain unknown. Do not infer labor savings from timestamps. |
| AI request cost, estimated USD per request (future) | Sum of recorded provider usage multiplied by the recorded applicable price version | Requests with complete billable token/usage records; show coverage against all attempted provider requests | Provider is disabled. Display Not enabled, not a fabricated zero-dollar bill. Timed-out/failed requests may incur cost; unknown usage stays unknown. Reconcile estimates with provider billing separately. |
| Assisted-service net receipts (future, payments disabled) | Verified captured payments minus verified refunds in the stated currency and transaction-time window | Paid cases for average receipts; transaction count for totals | Not enabled. Browser return URLs never count as paid. Separate currencies and fees. Do not add revenue to a customer-resolution denominator. |

Zero denominators display **No eligible records**, never 0% or 100%. A true recorded zero (for example zero seconds of a valid measured quantity where permitted) differs from unknown. Percentages show both counts and one decimal place; durations report minutes and coverage. Totals must not silently exclude missing-cost requests or missing-time cases.

## Worked acceptance examples

For three retained synthetic cases, A has four recognized answers including unknown/not-tried, B has three recognized answers, C has four. Checklist completion is 2/3 (66.7%). If A has two usable observations, B three and C four, observation coverage is 9/12 (75.0%). Neither number is a resolution rate.

If A is resolved, B escalated and C closed, currently marked resolved is 1/3 (33.3%) and currently escalated is 1/3 (33.3%). Customer-reported resolution remains unavailable because actor history is absent. If only A has a comparable app-launch pair of 20 and 12 seconds, measured improvement is 1/1, with pair coverage 1/3; it is not a 100% product repair rate.

If all three are demo fixtures, customer cohort count is unavailable rather than three. If an explicitly eligible cohort is empty, every rate has No eligible records. Missing handling intervals and disabled AI/payment features display unavailable/not enabled. Deleting B changes retained-record counts; it does not justify rewriting a historical success claim.

## Implementation boundaries for S8-02

Start with explicitly labeled owner-workspace retained counts and current-state labels. Apply existing server authorization to every source query. No internal notes, case descriptions, owner identifiers or raw customer observations belong in aggregate logs. Customer payloads must remain scoped to their owner.

Schema/event changes for authoritative demo flags, resolution actors, status history, timers, cost records or deletion-aware counts require a shared proposal and a single assigned owner. This document assigns no migration number and introduces no schema change. Until those inputs exist, render the corresponding metric unavailable; never generate representative results. Payments and AI remain disabled and outside this demo.
