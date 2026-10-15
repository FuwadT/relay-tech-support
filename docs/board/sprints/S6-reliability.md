# Sprint 6 — Usability and service reliability

**Status**: Not started  
**Budget**: 9.5 hours of tasks + 30 minutes contingency (570 minutes)
**Contingency**: 30 minutes allocated.  
**Goal**: Make supported workflows dependable across ordinary devices.

## Tasks
☑ **[S6-01](../issues/S6-01.md)**: Review mobile layouts — 90 min. Fix intake, checklist, and outcome screens at phone widths.; Done when primary tasks need no horizontal scrolling. Depends on: S2-08.
☑ **[S6-02](../issues/S6-02.md)**: Review accessibility — 90 min. Check keyboard use, labels, focus, contrast, and error announcements.; Done when the core journey works without a mouse. Depends on: S6-01.
☑ **[S6-03](../issues/S6-03.md)**: Handle interrupted work — 90 min. Prevent duplicate submissions and preserve saved progress after network failures.; Done when retrying does not silently duplicate cases. Depends on: S2-05.
☑ **[S6-04](../issues/S6-04.md)**: Add operational visibility — 90 min. Capture actionable errors without sensitive case content in general logs.; Done when a failed save can be diagnosed from an identifier. Depends on: S4-03.
☑ **[S6-05](../issues/S6-05.md)**: Rehearse recovery — 90 min. Document migrations, backup approach, rollback, and restore verification.; Done when recovery is exercised in a nonproduction environment. Depends on: S1-05.
☑ **[S6-06](../issues/S6-06.md)**: Run a release regression — 120 min. Check core flows and access boundaries on the release build.; Done when blocking defects are fixed or release is held. Depends on: S6-02, S6-03, S6-04, S6-05.

## Acceptance gate
Core flows remain usable during ordinary interruptions; recovery steps are demonstrated.

---
*Back to [Scrum Board](../BOARD.md)*
