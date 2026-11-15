# CareBuddy Medication Adherence Calculation (docs/ADHERENCE.md)

This document describes the exact formula and rules used across CareBuddy to compute medication adherence statistics, in compliance with Section 5.3 of the specification.

---

## 1. Core Formula

$$\text{Adherence \%} = \left( \frac{\text{TAKEN}}{\text{TAKEN} + \text{SKIPPED} + \text{MISSED}} \right) \times 100$$

The final value is rounded to the nearest whole percentage integer (e.g., $94.4\% \to 94\%$, $94.6\% \to 95\%$).

---

## 2. Eligibility Criteria for Doses

A dose is counted in the adherence calculation if and only if **all** of the following conditions are met:

1. **Not Voided**: The dose record has `voidedAt IS NULL`. (Doses voided due to schedule changes, paused medications, or timezone shifts are permanently excluded).
2. **Within Date Window**: The dose's `scheduledAt` falls strictly within the requested window evaluated in the profile's local timezone.
3. **Grace Period Passed**: The deadline $\text{scheduledAt} + \text{gracePeriod}$ has already elapsed.
4. **Active Medication at Scheduled Time**: The medication was in an `ACTIVE` status when scheduled (not paused, not prior to `startDate`, and not following `endDate` or `discontinuedAt`).
5. **Terminal State**: The dose has reached a terminal state (`TAKEN`, `SKIPPED`, or `MISSED`).

### Important Exclusions:
- Doses that are currently `PENDING` or `SNOOZED` within their active grace period are **excluded** (they are neither taken nor yet missed).
- Doses in the future are strictly excluded.

---

## 3. Empty State Handling

- If there are **zero eligible doses** in the selected window, the UI explicitly displays **"No data yet"**.
- The system **never** displays $0\%$ or $100\%$ when no eligible doses exist.

---

## 4. Count Breakdown Display

To ensure full transparency and avoid confusing a deliberate clinical skip with an accidental missed dose:
- Every adherence percentage display is accompanied by the raw breakdown:
  - **Taken** ($N_\text{taken}$)
  - **Skipped** ($N_\text{skipped}$)
  - **Missed** ($N_\text{missed}$)

---

## 5. Calculation Windows

Adherence is computed across three rolling windows, evaluated in the elderly profile's configured IANA timezone:
1. **Today**: From 00:00:00 to the current wall-clock instant in profile local time.
2. **Rolling 7 Days**: The past 7 calendar days up to the current moment.
3. **Rolling 30 Days**: The past 30 calendar days up to the current moment.

### Granularity:
- **Overall Profile Adherence**: Computed across all eligible medications for the profile.
- **Per-Medication Adherence**: Computed individually for each specific medication.

### Dose Corrections:
- If a dose is corrected (e.g. from `MISSED` to `TAKEN` with a recorded clinical reason), it counts according to its current, corrected state in adherence calculations, while retaining the immutable historical audit trail.
