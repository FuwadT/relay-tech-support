# Relay customer and support permissions

Implementation review: October 15, 2026. Applies to the guided candidate source, not a claim that customer/support operations are enabled on the hosted Site. Hosted access remains limited to the owner.

Identity comes from Sites-verified user ID and profile headers. Browser cookies, user-supplied role headers and role-switch endpoints cannot grant access. An explicit server-configured support email allowlist is a deployment-operator grant; it defaults empty and does not infer privileges from email domains or test identities. There is no application endpoint for granting roles. The admin type exists in contracts, but the current identity resolver grants only customer or explicitly configured support.

## Current enforced policy

| Operation | Customer, own case | Customer, another case | Explicitly granted support |
|---|---|---|---|
| Create/list own cases | Allowed with eligibility and consent | Cannot choose another owner | Create/list own cases |
| Read case details | Allowed | 404 | All cases for triage |
| Read support queue | 403 | 403 | All case content, including internal notes, up to current list limit |
| Edit answers/measurements | Allowed | 404 | Denied by support patch contract, including staff-owned cases |
| Update public notes and status | Allowed | 404 | All cases |
| Update assignment/internal notes | 403 | 403 | All cases |
| Export customer-visible case | Allowed; excludes internal notes | No case payload available | UI export excludes internal notes |
| Delete case | Allowed | 404 | 403; support cannot delete cases |
| Grant/revoke roles | Denied | Denied | Denied; deployment operator only |

This candidate uses broad staff triage access. Assignment is a recorded work label, not an authorization boundary or an atomic claim. Do not describe access as restricted to the assigned technician. A future assignment-scoped policy requires new server predicates and race tests before such a promise can be made. No grants or audience permissions were changed by this documentation review.

Customer payloads explicitly omit internal notes and owner/consent metadata. Cases remain owner-scoped by default; the queue parameter and case detail staff paths require a verified server grant on every request. Mutations validate origin, bounded JSON and allowed fields. Assignment never transfers case ownership.

A customer setting resolved records their report in verifiedAt. Staff handling changes preserve that field and cannot manufacture a new customer confirmation. Status is currently shared between customer and staff views; independent handling status, customer report history and append-only responses are not implemented. These are limitations to resolve before external support operations. Staff with a personal diagnostic case need an ordinary customer identity until dual-role editing is designed.

## Retention and recovery

Owner deletion removes the active case row, including saved answers, measurements and notes. No soft-delete archive is implemented. Backups can retain earlier copies: the local recovery rehearsal demonstrates that restoring a pre-deletion backup resurrects its synthetic record. Actual hosted backup expiry, deletion replay and restore procedures remain required before customer retention promises. See ../docs/RECOVERY.md.

## Evidence and remaining release gate

Local access checks pass with two simulated customers and one explicitly configured support identity: cross-owner CRUD denied, customer queue denied, customer DTOs redact internal notes, staff deletion denied, and staff status changes preserve the customer timestamp. Real hosted owner sign-in and saved journeys have also been exercised on older version 2. These checks do not establish hosted two-user isolation, session expiry or trust-header stripping on the candidate. Customer invitations and staffed support commitments remain disabled until those gates and recovery checks pass.
