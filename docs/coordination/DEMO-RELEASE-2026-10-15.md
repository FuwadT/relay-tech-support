# Owner-only demo release — October 15, 2026

Demo status: ready for the founder's guided walkthrough. This is not an external customer release or completion of Sprint 8.

- URL: https://tech-support-mvp-fuwad.fuwadtufail.chatgpt.site
- GitHub: PR #4 merged at `6dd00e4fe15721935a416d696b60cd61e6293fa0`; reviewed head `24562afe80e244b9115acb6642a4fa074db9f036`.
- CI: run `38786728384` passed 34 unit tests, strict TypeScript, production build, SQLite recovery and 68 local HTTP assertions.
- Sites source: `e477dc677065396e65da78c9cfb010362a632eb0`; exact tracked tree matches reviewed GitHub head (`94470f99e1c3283404ab6b3e4ef8c91a25a49f85`). Staging checkout: `C:/Users/fuwad/Relay-demo`, with independent dependencies and runtime state.
- Saved version: 3, `appgprj_6acd93266d1881918a5974ceccd38335~appgver_893306f6f5608191a8d184004ed82342`.
- Deployment: `appgdep_6ad11cf333f08191a7387fd1ca68babc`, succeeded at 18:35 UTC. Private deployment enforced unchanged owner-only access. No invitations, support grants or audience changes.
- Archive SHA256: `86405196e1e1324f55319c4c5999c0cbd3b4bb80ca488cc493c3dd578808bb02`. Saved archive contains build output and immutable migration history 0000–0003. No applied migration was edited.

## Hosted acceptance through the real owner session

1. Both earlier synthetic cases survived the deployment. Slowdown retained four answers, notes and In progress status. Connectivity retained four answers, unknown/not-tried values, notes and Needs a technician status. No actual repair or technician contact was reported.
2. The older slowdown case initially displayed the new notice that its earlier plan was not saved. Saving measurements created provenance; the legacy notice then disappeared. Version 1.0.2 and comparison remained after reload.
3. Created `QA version 3 demo — synthetic Oct 15` on the new release. Saved illustrative app-launch baseline 20 seconds and follow-up 12 seconds. After reload/reopening, comparison remained -8 seconds, improved; other readings stayed Not recorded/INCOMPLETE. The causal limitation remained visible.
4. Downloaded its JSON export. It contains `measurements.baseline.app_launch_seconds=20`, `measurements.followUp.app_launch_seconds=12`, the saved snapshot, evidence and rule version. It excludes userId, consentAt and internalNotes. The downloaded fixture remains local and is not committed.
5. Deletion confirmation focused Keep case; Escape cancelled and restored Delete case focus. No hosted record was deleted. Skip-link activation focused MAIN/main-content.
6. At a temporary 390px viewport, document width was 375px (no page overflow on the sampled case detail). Viewport override reset. Full accessibility review remains open.

An immediate post-deployment reload initially rendered older startup references and unresponsive controls. A fresh version-tagged navigation loaded the new release; subsequent saves and reloads succeeded. Browser/edge cache propagation was not independently characterized. Demo link may use `?relay_qa=version3` if the older page is retained.

## Packaging evidence and limits

Fresh pinned dependency installation, 34 tests, TypeScript, recovery and build passed in staging. Git Bash GNU tar interpreted a Windows drive prefix as a remote host; retrying the trusted helper with process-local `TAR_OPTIONS=--force-local` packaged successfully. No plugin or application workaround was introduced.

All three hosted fixtures are explicitly synthetic and retained. No live model, payment or external support service is enabled. Remaining external gates: two real customer identities, hosted header/session boundary checks, durable duplicate-create protection, full accessibility, and D1 backup/restore retention/deletion replay. AI safety failures remain isolated in draft PR #2. Main branch protection remains unavailable under the private repository's current GitHub plan.

Next: complete S6-02 keyboard/accessibility review, agree S6-03's idempotency contract with Gemini, and define S8-01 metrics without presenting synthetic fixtures as customer results.
