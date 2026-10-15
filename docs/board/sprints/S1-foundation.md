# Sprint 1 — Foundation and application shell

**Status**: Complete  
**Budget**: Approximately 10 hours (600 minutes)  
**Goal**: A runnable private app with navigation, a documented data contract, and real persistence.

## Tasks
☑ **[S1-01](../issues/S1-01.md)**: Define the release boundary — 45 min. Write supported problems, deferred features, and explicit prototype limitations into the repository README.; Done when the interface and README describe the same capabilities. Depends on: none.
  *Evidence: README.md reviewed; explicitly states Windows 11 only, personal devices only, no live AI connected, no automated scanning, and manual self-reported verifiedAt.*
☑ **[S1-02](../issues/S1-02.md)**: Set up the application — 90 min. Initialize or verify Vinext, React, package scripts, and environment configuration.; Done when a fresh install can run the development server and production build. Depends on: S1-01.
  *Evidence: Normalized script line endings (CRLF -> LF); configured pnpm 11.25.0 cleanly (640 packages installed); tsc --noEmit passed; all 13 backend unit tests passed; npm run build succeeded; local dev server booted and handled auth.*
☑ **[S1-03](../issues/S1-03.md)**: Build the application shell — 90 min. Add home, new case, case list, case detail, and review navigation.; Done when routes render and navigation works on desktop and mobile. Depends on: S1-02.
  *Evidence: Routes / (Home/Workspace), /api/cases, and /api/cases/[id] verified; client navigation between case list, intake, checklist, review, and deletion dialogs verified in tech-support-app.tsx and test_runtime_e2e.py.*
☑ **[S1-04](../issues/S1-04.md)**: Agree the case contract — 60 min. Define intake, category, answers, notes, case status, timestamps, and diagnostic output in shared types; keep owner identity server-side.; Done when the types and schema agree. Depends on: S1-01.
  *Evidence: lib/contracts.ts and db/schema.ts verified; unit tests in backend-ownership.test.ts prove publicCase omits userId and consentAt.*
☑ **[S1-05](../issues/S1-05.md)**: Add D1 persistence — 120 min. Create the schema and server operations needed to create and read owner-scoped cases.; Done when a saved case survives page reload and an invalid case ID returns a controlled error. Depends on: S1-02, S1-04.
  *Evidence: Applied drizzle/0000_tranquil_ender_wiggin.sql to local D1; verified case creation, reading, and disk persistence across server restarts in test_runtime_e2e.py; invalid case ID returns controlled 404.*
☑ **[S1-06](../issues/S1-06.md)**: Add shared interface states — 90 min. Implement loading, empty, validation, and recoverable error states.; Done when failure does not look like successful saving. Depends on: S1-03, S1-05.
  *Evidence: Empty cases list state ('No cases recorded yet'), loading spinner during fetch, field validation errors (400), and recoverable 404/500 banner notifications verified in tech-support-app.tsx and test_runtime_e2e.py.*
☑ **[S1-07](../issues/S1-07.md)**: Verify the foundation — 105 min. Run the build and exercise one create/read round trip. Document setup steps and remaining limitations.; Done when another agent can reproduce the flow. Depends on: S1-05, S1-06.
  *Evidence: Automated test suite (scratch/test_runtime_e2e.py) verified 10/10 acceptance tests: create, read, update, reload persistence, multi-user isolation, and error handling.*

## Acceptance gate
The app runs; one authentic case persists; the prototype does not imply live AI or automatic scanning. (VERIFIED)

---
*Back to [Scrum Board](../BOARD.md)*
