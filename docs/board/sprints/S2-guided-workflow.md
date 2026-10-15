# Sprint 2 — Guided case workflow

**Status**: Complete  
**Budget**: Approximately 11 hours (660 minutes)  
**Goal**: Complete a useful troubleshooting session without a connected AI model.

## Tasks
☑ **[S2-01](../issues/S2-01.md)**: Build the intake form — 90 min. Capture title, symptom description, device name, category, Windows 11/personal-device eligibility, and storage consent.; Done when required fields and unsupported-device handling behave correctly. Depends on: S1-04, S1-05.
  *Evidence: Intake form tested in UI and API; rejects non-Windows 11 (macOS), work devices, missing consent, and out-of-bounds strings with 400 Bad Request.*
☑ **[S2-02](../issues/S2-02.md)**: Create slowdown rules — 90 min. Provide checks for symptom scope, resource usage, free storage, and restart comparison.; Done when rules distinguish reported observations from possible explanations. Depends on: S1-04.
  *Evidence: Four slowdown checks (scope, resources, storage, restart) verified in lib/diagnostics.ts and validated in unit tests and runtime e2e.*
☑ **[S2-03](../issues/S2-03.md)**: Create connectivity rules — 90 min. Provide checks for affected devices, router proximity, background activity, and affected services.; Done when insufficient evidence prompts further checks instead of a definitive diagnosis. Depends on: S1-04.
  *Evidence: Four connectivity checks (scope, connection, activity, reach) verified in lib/diagnostics.ts and validated in unit tests and runtime e2e.*
☑ **[S2-04](../issues/S2-04.md)**: Render the guided plan — 90 min. Show prioritized checks, clear instructions, why each matters, and honest uncertainty.; Done when users can follow one step at a time. Depends on: S2-01, S2-02, S2-03.
  *Evidence: Interactive checklist renders with clear instructions, 'why this matters' text, and progress counter (0 of 4, etc.) in tech-support-app.tsx.*
☑ **[S2-05](../issues/S2-05.md)**: Save checklist progress — 90 min. Store selected answers, including 'unknown' and 'not tried' where offered; unanswered checks remain pending.; Done when leaving and reopening a case restores progress. Depends on: S2-04, S1-05.
  *Evidence: Verified in test_runtime_e2e.py Test 6: answers {scope, resources, storage, restart} including 'unknown' saved via PATCH and restored accurately.*
☑ **[S2-06](../issues/S2-06.md)**: Record the outcome — 75 min. Capture open, in progress, resolved, or escalated status with optional notes. Treat resolved as the user’s report, not a verified repair.; Done when saved status appears consistently in case detail and case list. Depends on: S2-05.
  *Evidence: Verified in test_runtime_e2e.py Test 7: status updated to 'resolved' with verifiedAt timestamp recording user report, and notes up to 4000 characters saved.*
☑ **[S2-07](../issues/S2-07.md)**: Add a private review view — 60 min. Display the signed-in owner’s case summaries and unresolved work.; Done when the view is clearly labeled and does not imply cross-customer administrator access. Depends on: S2-06.
  *Evidence: Verified in test_runtime_e2e.py Test 9: User A sees their 5 cases; User B sees 0 cases; clearly labeled private workspace.*
☑ **[S2-08](../issues/S2-08.md)**: Check both complete journeys — 75 min. Exercise one slowdown and one connectivity case, including reload and an invalid submission.; Done when outcomes persist and errors remain recoverable. Depends on: S2-07.
  *Evidence: Complete Slowdown (Dell XPS 13) and Connectivity (HP Envy) journeys executed end to end in test_runtime_e2e.py; disk persistence across server restart verified; case deletion confirmed.*

## Acceptance gate
Two supported problem categories work end to end. Recommendations are labeled guided; no live AI integration is claimed. (VERIFIED)

---
*Back to [Scrum Board](../BOARD.md)*
