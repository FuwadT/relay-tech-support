# Relay Scrum Board Documentation

This directory (`docs/board/`) maintains the official Scrum Board, task issues, sprint specifications, and inter-agent handoff logs for **Relay (AI Tech Support MVP)**.

## Structure
- `BOARD.md`: Central Kanban board, sprint summaries, milestone tracker, and active priority queue.
- `sprints/`: Detailed markdown specifications for each of the 8 weekly sprints (S1 through S8).
- `issues/`: Individual markdown files for all 55 tasks formatted per the project issue template.
- `ROLES.md`: Agent role responsibilities and parallelization boundaries.
- `HANDOFF.md`: Living handoff log recording working URLs, commits, verification evidence, and next steps.
- `FIRST-SESSION.md`: First session orientation checklist.
- `RELEASE-CHECKLIST.md`: Acceptance gate required before any external customer release.
- `DEFERRED.md`: Explicit list of deferred and excluded features.

## Rules of Progress
1. A task is complete only when its deliverable exists and its completion check passes.
2. Dependencies are strictly enforced. Tasks transition from `Backlog` to `Ready` when all prerequisites are complete.
3. Tasks must take 30–120 minutes. If a task exceeds 2 hours, split it.
4. Move unfinished work forward rather than silently increasing scope.
