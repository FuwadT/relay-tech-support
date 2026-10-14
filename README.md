# Relay — private tech support MVP

Relay helps a signed-in owner record a Windows 11 performance or home-connectivity problem, follow guided checks, save observations, and review next steps. This is a private development release; it is not ready for customer rollout.

## Implemented scope

- Personal Windows 11 device intake with explicit consent.
- Four structured checks per problem category and deterministic, evidence-based guidance.
- Owner-scoped saved cases, notes, user-reported resolution/escalation, deletion and browser JSON export.
- Server-side input validation, same-origin mutation checks and ChatGPT identity.
- D1 database schema and checked-in Drizzle migration.

No model is connected. The app does not scan devices, execute commands, remotely access a computer, or verify a repair. `verifiedAt` records when the user reports resolution; it is not independent verification. Support escalation is a saved status, not a message to a staffed service.

## Development

Source uses Vinext, React, TypeScript and Drizzle/D1. The Sites plugin owns build/publication and hosted authentication. `.openai/hosting.json` binds `DB`. Install and build through the Sites skill helpers. For standalone use, the package scripts provide `npm run dev`, `npm run build` and `npm run db:generate`.

Use the existing `tests/` fixtures to validate rule branches, input bounds and owner SQL predicates. The integration handoff records the exact test command and results. Generated schema migrations are in `drizzle/`; publication applies hosted migrations. Do not edit applied migration history.

## Before customer release

Complete a real signed-in create/check/update/reload/delete journey, desktop and mobile browser QA, and two-identity authorization testing. Then add customer/support roles, service monitoring, retention procedures and verified recovery. Live AI, measured before/after outcomes, uploads and payments are future sprints. No payment or model credentials are configured.

The current case list is limited to the 200 most recently updated records. Multi-device concurrent editing, pagination, duplicate-submission idempotency and production rate limits remain future work.

## Verification in this build

Backend review passed 13 automated checks; the generated migration also applied to fresh SQLite. Owner-predicate unit tests are not a substitute for hosted two-user API tests. Browser QA and a real hosted case round trip remain outstanding.

Run the backend suite from the repository root:

```sh
node node_modules/typescript/bin/tsc --outDir /tmp/relay-backend-tests --module commonjs --target ES2022 --esModuleInterop --skipLibCheck tests/diagnostics.test.ts tests/backend-ownership.test.ts
NODE_PATH="$PWD/node_modules" node --test /tmp/relay-backend-tests/tests/*.test.js
```
