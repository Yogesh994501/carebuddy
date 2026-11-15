# CareBuddy Ten Release Gates Verification (docs/VERIFICATION.md)

This document tracks the automated verification and status of the ten release gates defined in Section 16 of the CareBuddy build specification.

---

| Gate # | Name | Description | Command | Status | Evidence Summary |
|---|---|---|---|---|---|
| **Gate 1** | Persistence | Create data, restart API, worker & database, log out and back in; everything persists. | `npm run test:gate1` | PENDING | To be verified in Stage 9 |
| **Gate 2** | Background scheduling | With browser closed, advance clock; doses generated, reminders created, overdue become MISSED. | `npm run verify:stage4` | PASS ✅ | With browser closed, worker polls independently via SKIP LOCKED, claims DOSE_UPCOMING, queues in-app reminders, detects overdue dose, marks MISSED at grace deadline via SYSTEM_WORKER, writes immutable MedicationLog, and queues alert. |
| **Gate 3** | Timezone & DST | Asia/Kolkata (no DST), America/New_York (spring/fall), Europe/London, Lord_Howe (30m shift). | `npm run verify:stage3` | PASS ✅ | 6/6 tests passed. Zero dropped or doubled doses on transition days; spring-forward moves to 03:00; fall-back uses first occurrence; regeneration on timezone change verified. |
| **Gate 4** | No duplicates | Concurrent workers, crash mid-job replay; 0 duplicate doses or notifications, lease recovery. | `npm run verify:stage4` | PASS ✅ | Full verification: 3 concurrent workers claiming 30 jobs via SKIP LOCKED produced 0 duplicate claims; worker crash mid-job lease expiry recovered by sweeper and completed; DLQ moved failing jobs to DEAD after 5 attempts. |
| **Gate 5** | Backend permissions | Route-by-role matrix (owner, family, caregiver, cross-profile, revoked, anon) + instant revocation. | `npm run verify:stage5` | PASS ✅ | 19/19 tests passed across all existing routes: profiles, care network, invitations, medications, doses, appointments, notes, activity timeline, and notifications. Immediate revocation & IDOR defense verified. |
| **Gate 6** | MISSED != TAKEN | Reminder opening/snooze != TAKEN; MISSED only by worker; adherence excludes unconfirmed; audit retained. | `npm run verify:stage3` | PASS (Transition Half) ✅ | Snooze never creates TAKEN; max 3 snoozes enforced; client cannot set MISSED; correcting MISSED preserves history; adherence excludes pending/snoozed within grace. |
| **Gate 7** | Synchronized dashboards | Playwright 3 sessions (owner, family, caregiver): dose/appointment change syncs <= 2s without reload. | `npm run test:gate7` | PENDING | To be verified in Stage 6 |
| **Gate 8** | Mobile & accessibility | Playwright 375, 768, 1280px; axe-core 0 serious/critical violations; keyboard dose recording; elderly mode. | `npm run test:gate8` | PENDING | To be verified in Stage 8 |
| **Gate 9** | AI safety | Context builder isolation; emergency short-circuit; output filters; prompt-injection tests (30 red-team prompts). | `npm run test:gate9` | PENDING | To be verified in Stage 7 |
| **Gate 10** | Demo reliability | Fresh clone: 1 command setup, seed:demo, login all roles, reset twice. Only fictional data; non-demo untouched. | `npm run test:gate10` | PENDING | To be verified in Stage 9 |

---

### Stage 1 Acceptance: Database Migration & Schema Verification
- **Target**: Migrates cleanly on an empty database; all 21 models created with indexes, unique constraints, and append-only triggers.
- **Verification Command**: `npm run verify:stage1`
- **Result**: PASS ✅
  - Clean migration executed against an isolated, empty PostgreSQL database cluster.
  - All 21 models verified present in `public` schema.
  - Required indexes created (including `(profileId, scheduledAt)`, `(status, scheduledAt)`, `(status, runAt)`, and `(recipientId, readAt, createdAt)`).
  - Immutability triggers verified: UPDATE and DELETE operations on `MedicationLog` and `AuditLog` are rejected with runtime exceptions.

### Stage 2 Acceptance: Auth, Authorization & Gate 5 Matrix
- **Target**: Gate 5 matrix passes for all routes that exist; accounts, sessions, recovery codes, profile creation, membership resolution, permission middleware, and invitations.
- **Verification Command**: `npm run verify:stage2`
- **Result**: PASS ✅ (16/16 tests passing)
  - `src/tests/auth.test.ts`:
    - Registration with argon2id hashing, 8 recovery codes generated & returned once, server session creation.
    - Login with cookie issuance.
    - Password recovery via single-use recovery code with full session revocation.
    - Single-use recovery code prevention.
  - `src/tests/gate5.test.ts`:
    - Anonymous access returns 401 across protected routes.
    - Cross-profile ID guessing returns 404 (never 403, preventing resource existence leakage).
    - Owner-only routes (timezone/reminder editing, inviting, member revocation, full audit log) strictly enforced against family and caregiver.
    - Real-time revocation verified: deleting/revoking a member takes effect immediately on their next request (returns 404).

### Stage 3 Acceptance: Medications, Dose Engine & Invariants
- **Target**: Gate 3 (Timezone & DST), Gate 4 generation half (no duplicates under concurrency), and Gate 6 transition half (MISSED != TAKEN).
- **Verification Command**: `npm run verify:stage3`
- **Result**: PASS ✅ (13/13 tests passing)
  - `src/tests/gate3_timezone_dst.test.ts`:
    - Asia/Kolkata (fixed UTC+5:30) wall-clock precision.
    - America/New_York spring-forward (02:30 moves to 03:00 without dropping dose).
    - America/New_York fall-back (01:30 uses first occurrence without doubling).
    - Europe/London and Australia/Lord_Howe (30-minute DST shift) instant accuracy.
    - Timezone change voids future unacted doses and regenerates under new zone while leaving past doses untouched.
  - `src/tests/gate4_generator_concurrency.test.ts`:
    - 2 concurrent workers running generation produced 0 duplicate doses.
    - Job replay after simulated crash inserted 0 new records.
  - `src/tests/gate6_state_machine.test.ts`:
    - Snoozing a dose sets status = SNOOZED, never TAKEN; scheduledAt (MISSED deadline) is never moved.
    - Max 3 snoozes enforced.
    - Client apps cannot mark MISSED (restricted to SYSTEM_WORKER).
    - Correcting MISSED preserves historical MISSED record in MedicationLog and appends CORRECTION.
    - Adherence calculation excludes pending and snoozed doses inside their grace period.

### Stage 4 Acceptance: Worker and Notifications (Gates 2 & 4)
- **Target**: Background worker claiming jobs with `FOR UPDATE SKIP LOCKED`, 60 s lease with heartbeat, exponential backoff, dead-letter; handlers for dose generator, upcoming reminder, missed check, appointment reminder; in-app notification center.
- **Verification Command**: `npm run verify:stage4`
- **Result**: PASS ✅ (7/7 tests passing)
- **Test Evidence**:
  - `src/tests/gate2_background_scheduling.test.ts`:
    - Enqueues `DOSE_UPCOMING` and `DOSE_MISSED_CHECK` background jobs for pending doses.
    - Background worker executes poll cycle with browser closed; claims `DOSE_UPCOMING` and generates in-app notifications for both owner and caregiver.
    - Grace deadline passes: worker claims `DOSE_MISSED_CHECK`, transitions dose to `MISSED` via `SYSTEM_WORKER`, appends immutable `MedicationLog`, and delivers in-app alert notification.
    - Strictly forbids client apps or snoozing from transitioning to `MISSED` (Section 5.2 & Gate 6).
  - `src/tests/gate4_worker_concurrency.test.ts`:
    - 3 simulated concurrent worker instances claiming 30 jobs via `FOR UPDATE SKIP LOCKED` simultaneously: exactly 30 unique job IDs claimed, 0 duplicate claims across all workers.
    - Crash mid-job simulation: worker holding 60s lease crashes, lease expires, recovery sweeper reclaims job to `QUEUED`, healthy worker claims and completes the job (`SUCCEEDED`).
    - Dead-letter queue: after 5 failed attempts, job is transitioned to `DEAD` without crashing the queue or blocking other workers.

### Stage 5 Acceptance: Appointments, Care Network & Gate 5 Matrix
- **Target**: Appointment CRUD, 24 h and 2 h reminders, rescheduling with audit. Shared activity timeline and caregiver notes. Gate 5 passes for all routes that exist.
- **Verification Command**: `npm run verify:stage5`
- **Result**: PASS ✅ (19/19 tests passing)
- **Test Evidence**:
  - `src/tests/gate5.test.ts`:
    - **Unauthenticated Access**: Rejected with 401 across all endpoints.
    - **IDOR Defense**: Accessing a profile that belongs to another user returns 404 `PROFILE_NOT_FOUND` (never 403), preventing enumeration of valid profile IDs.
    - **Owner-Only Operations**: Updating profile timezones, inviting network members, revoking memberships, and accessing raw audit logs strictly enforced against family and caregivers (403 `OWNER_PERMISSION_REQUIRED`).
    - **Appointments CRUD & Reminders**: Owner creates appointments (201); Family and Caregiver rejected with 403 `FORBIDDEN` (`manageAppointments: false`); 24h & 2h reminder background jobs enqueued; Rescheduling cancels previous reminders and updates `rescheduledFrom`; Cancelling expires pending reminders.
    - **Caregiver Notes**: Caregiver and Owner can add notes (201, `addNotes: true`); Family rejected with 403 (`addNotes: false`); Family and Caregiver can view notes (200, `viewActivity: true`); Author can delete own note; non-author non-owner rejected (403).
    - **Shared Activity Timeline**: Aggregated chronological clinical milestones (doses, appointments, caregiver notes, membership events) accessible to members with `viewActivity`; sensitive technical details (IP addresses, user agents) stripped.
    - **Notification Isolation**: Users access only their own notifications; attempting to mark another user's notification returns 404.
    - **Instant Real-Time Revocation**: Revoking a member by the owner takes effect immediately on their next request (returns 404).


