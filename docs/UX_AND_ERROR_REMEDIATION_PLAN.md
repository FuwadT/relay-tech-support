# Relay Tech Support — UX Redesign & Error Remediation Plan

## Overview
This document tracks the resolution of the 7 UX and engineering issues identified in live testing of the Relay diagnostic assistant.

## The 7 Target Issues & Technical Resolutions

### 1. Follow-Up "Amnesia Loop" & Multi-Turn State Machine
- **Problem:** Asking a follow-up question after telemetry collection reset the chat and re-rendered the Device Platform & Authorization card.
- **Solution:** Introduce explicit `TriageStage` state machine:
  - `intake_discovery`: Opening prompt and symptom classification.
  - `deductive_questioning`: Clarifying questions with quick-reply chips before downloads.
  - `awaiting_authorization`: Device platform selection and consent cards.
  - `awaiting_telemetry`: Direct collector script execution, clipboard ingestion, or browser simulation.
  - `active_investigation`: Telemetry loaded. Follow-up queries inspect `activeSnapshot` and `activeFindings` directly and never re-render authorization.

### 2. Socratic & Deductive Conversational Triage
- **Problem:** Assistant jumped directly to script download on turn 1 without diagnosing the issue conversationally.
- **Solution:** 
  - Opening prompt: *"Hello! What seems to be the issue you are having today? Describe what's happening in your own words, or pick a common symptom above."*
  - Deductive decision trees with quick-reply chips for CPU/fan, network/Wi-Fi, disk space, and application crashes.
  - Deliver zero-install resolution first with "Solved my issue" vs "Still happening — run deep system check" options.

### 3. PowerShell `C:\WINDOWS\system32` Access Denied Error
- **Problem:** Relative `-OutFile inspect.ps1` failed when PowerShell opened in `C:\WINDOWS\system32` with `UnauthorizedAccessException`.
- **Solution:** Output to safe system temporary paths (`$env:TEMP\relay-inspect.ps1` on Windows, `/tmp/relay-inspect.sh` on macOS/Linux) with `Unblock-File`.

### 4. Bypass Manual Copy-Paste Friction (Auto-POST & Auto-Clipboard)
- **Problem:** Users were forced to manually copy-paste raw JSON from terminal windows.
- **Solution:**
  - In `windows.ps1` / `windows11.ps1`: copy to clipboard automatically via `Set-Clipboard` and optionally POST to `RELAY_CALLBACK_URL`.
  - In `macos.sh` / `ubuntu.sh`: copy to clipboard automatically via `pbcopy`, `wl-copy`, or `xclip`.
  - In web interface: 1-Click "Paste from Clipboard" button using `navigator.clipboard.readText()` with seamless fallback to manual textarea.
  - Endpoint `/api/cases/[id]/telemetry` for direct script callback uploads.

### 5. Safe Telemetry Formatting & Symptom-to-Finding Alignment
- **Problem:** Missing metrics rendered as bare `%`, and raw floats (`1746.883 / 8325.325 MB`) were displayed without friendly percentage context.
- **Solution:**
  - Export `formatCpuUsage()`, `formatMemoryUsage()`, `formatDiskFree()` helpers.
  - Display "Not sampled" for uncollected metrics rather than blank or bare `%`.
  - Implement symptom-aware bridging when user reported CPU symptoms but loaded telemetry shows alternative faults (e.g., DNS).

### 6. Synchronized OS Auto-Detection
- **Problem:** App footer reported Windows 11 while chat header badge and selection defaulted to Ubuntu.
- **Solution:**
  - Shared `detectClientPlatform()` utility detecting `'windows'`, `'macos'`, or `'ubuntu'`.
  - Initialize both header badge, dropdown selection, and footer dynamically on client mount.

### 7. Markdown Rendering in Chat Messages
- **Problem:** Literal `**bold**` and `` `code` `` rendered in chat bubbles.
- **Solution:**
  - Implement safe inline tokenizer `renderFormattedMessage()` parsing `**bold**` and `` `code` `` without `dangerouslySetInnerHTML`.

## Files Changed
1. `docs/UX_AND_ERROR_REMEDIATION_PLAN.md` (new)
2. `lib/enterprise/findings.ts` (formatting helpers & symptom-aware explanation)
3. `lib/enterprise/collector-scripts.ts` (temp path snippets & auto-clipboard)
4. `components/enterprise-chat-view.tsx` (state machine, deductive triage, clipboard, formatting, markdown)
5. `components/tech-support-app.tsx` (OS sync in footer)
6. `app/api/cases/[id]/ai-explain/route.ts` (contextual telemetry explainer)
7. `app/api/cases/[id]/telemetry/route.ts` (new callback endpoint)
8. `enterprise/collectors/windows.ps1` & `public/collectors/windows.ps1` & `windows11.ps1`
9. `enterprise/collectors/ubuntu.sh` & `public/collectors/ubuntu.sh`
10. `enterprise/collectors/macos.sh` & `public/collectors/macos.sh`
11. `tests/enterprise-chat.test.ts` & `tests/enterprise-windows-collector.test.ts`
