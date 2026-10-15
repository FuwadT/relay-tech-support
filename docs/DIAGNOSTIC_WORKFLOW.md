# Relay Diagnostic Workflow & Case Review Guide

**Audience**: Support operators, triage reviewers, and diagnostic engine contributors.  
**Current Rule Engine Specification**: `1.0.2`; historical cases retain their saved snapshot version.  
**Operating Scope**: Personally owned Windows 11 devices (Computer Performance & Home Connectivity).

---

## 1. Core Principles of Relay Diagnostics

Relay is a guided diagnostic assistant that helps users methodically observe and record device behavior. It never performs background scanning, registry edits, automated file deletions, or remote control. 

When reviewing or evaluating a case in Relay, operators must strictly maintain the distinction between three categories of information:
1. **Observations** (Empirical user-reported facts)
2. **Hypotheses** (Engine inferences and explanations grounded in evidence)
3. **Reported Outcomes** (User-confirmed results and before/after comparisons)

---

## 2. Information Taxonomy

```
+-------------------------------------------------------------------------+
|                               CASE RECORD                               |
+-------------------------------------------------------------------------+
       |                               |                              |
       v                               v                              v
 [OBSERVATIONS]                  [HYPOTHESES]                 [REPORTED OUTCOMES]
 - Intake description            - Analysis headline          - Customer-reported resolution
 - Category & OS verification    - Diagnostic findings        - VerifiedAt timestamp
 - Guided check answers (0..4)   - Grounded next steps        - Comparison table
 - Baseline measurements         - Engine limitations & notes - Incomplete data flags
 - Follow-up measurements        - Provenance (ruleVersion)
```

### A. Observations (Inputs)
- **Intake details**: Device name, operating system (`windows11`), ownership (`personal`), user-reported symptom summary.
- **Guided check observations**: Answers to the four standard checks per category:
  - *Performance*: Scope (system-wide vs single app), Task Manager bottleneck (CPU vs Memory vs Disk), Storage free space, Restart behavior.
  - *Network*: Scope (one device vs all devices), Proximity to router, Activity impact, Reach (all sites vs one service).
- **Structured measurements**: Self-reported numeric metrics captured before (baseline) and after (follow-up) troubleshooting.
  - *Rule*: Missing measurements must **always remain unknown / null**. They are never coerced to zero.

### B. Hypotheses (Engine Inferences)
- **Grounded conclusions**: Generated deterministically by `analyzeCase(caseRecord)` using rules tagged with `ruleVersion`.
- **Honest uncertainty**: If zero or few checks are answered, the engine explicitly reports: *"0 of 4 checks answered — No conclusive bottleneck identified yet."*
- **Explicit limitations**: Every report carries transparent boundaries stating what Relay cannot inspect (e.g. background telemetry, hardware sensor degradation, physical cabling).
- **Evidence provenance**: Each analysis tracks `evidenceUsed` (e.g. `['scope:one_app', 'resources:memory']`), recorded with the saved analysis snapshot on evidence updates; older cases without snapshots are evaluated with current rules and must not be represented as historical plans.

### C. Reported Outcomes (Resolution)
- **User-reported resolution**: A customer marking their case `resolved` sets `verifiedAt`. It records their report of improvement. Staff handling-status changes do not set this timestamp. A staff-set resolved status alone is not a customer resolution report or an automated verification of repair.
- **Before/After comparisons**: Shows numerical delta between baseline and follow-up readings, tagged with direction:
  - `improved`: Metric changed favorably (e.g. lower launch time, higher download speed).
  - `worsened`: Metric degraded.
  - `unchanged`: Recorded values remained identical. Small nonzero changes are preserved rather than rounded to zero.
  - `incomplete`: Either baseline or follow-up is missing.
- **Non-causation disclaimer**: Differences in measurements provide observable correlation, not definitive proof of causality.

---

## 3. Reviewing Unresolved, Ambiguous, and Contradictory Cases

When a case is unresolved or produces ambiguous observations, follow this systematic evaluation protocol:

### Step 1: Check Data Completeness
- Review the answered count (`answered / 4`). If fewer than 2 checks are answered, recommend that the user complete the remaining checks before trying irreversible steps.
- Inspect measurement completeness. Incomplete comparisons (`direction === 'incomplete'`) indicate that at least one value is missing; matching conditions must be checked separately.

### Step 2: Identify Contradictory Evidence Patterns
Common conflicting observation patterns and their interpretations:
- **Wired connection + All devices affected**: This does not establish simultaneous failure or a cause. Compare two unrelated services on both devices at the same time before narrowing the explanation.
- **Single app lag + High memory usage**: These reports do not distinguish an application defect, other running workloads or device capacity. Record the recognizable app name, repeat the same task, and compare memory readings without stopping unfamiliar processes. Do not label the cause a memory leak from these observations.
- **No sustained high resource usage + CPU or memory reading above 90%**: Confirm whether the checkbox answer and numeric reading describe the same time and workload. Repeat during the symptom and correct inaccurate entries before narrowing the explanation.
- **Fast speed test + High application latency**: When raw bandwidth is high (>100 Mbps) but video calls freeze, check Wi-Fi stability, packet jitter, and CPU spikes during call encoding rather than upgrading ISP tier.

### Step 3: Evaluate Next Steps
- Verify that suggested next steps are **non-destructive** and sequential (e.g., repeating the approved observations under comparable conditions).
- If the issue requires hardware inspection or remains unresolved after supported checks, record **Escalated** (`Needs a technician`). These guided checks do not establish a hardware failure.

---

## 4. Case Escalation Criteria

A case should be marked as `escalated` (`Needs a technician`) when:
1. Recommended software checks and clean reboots fail to improve baseline metrics.
2. Hardware indicators are reported (e.g., clicking drive noises, thermal shutdown, physical port damage).
3. The device is managed by an enterprise/school domain requiring administrative rights.
4. The user requires hands-on assistance beyond self-guided instructions.

*Note: In the MVP, marking a case as escalated records the operational decision in case history; it does not dispatch a live technician.*

---

## 5. Audit & Compliance Checklist

Before closing an audit review on any diagnostic case:
- [ ] Device eligibility confirmed (personal Windows 11 only).
- [ ] User consent recorded at intake.
- [ ] No remote access or automated repair claims made in notes or communication.
- [ ] Exported rule version agrees with the saved analysis snapshot; do not require historical cases to match the latest rules.
- [ ] Missing/invalid readings remain unknown. A genuine recorded zero is preserved as zero.
- [ ] Case export JSON valid and verifiable.
