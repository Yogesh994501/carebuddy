# CareBuddy Ten Release Gates Verification (docs/VERIFICATION.md)

This document tracks the automated verification and status of the ten release gates defined in Section 16 of the CareBuddy build specification.

---

| Gate # | Name | Description | Command | Status | Evidence Summary |
|---|---|---|---|---|---|
| **Gate 1** | Persistence | Create data, restart API, worker & database, log out and back in; everything persists. | `npm run test:gate1` | PENDING | To be verified in Stage 9 |
| **Gate 2** | Background scheduling | With browser closed, advance clock; doses generated, reminders created, overdue become MISSED. | `npm run test:gate2` | PENDING | To be verified in Stage 4 |
| **Gate 3** | Timezone & DST | Asia/Kolkata (no DST), America/New_York (spring/fall), Europe/London, Lord_Howe (30m shift). | `npm run test:gate3` | PENDING | To be verified in Stage 3 |
| **Gate 4** | No duplicates | Concurrent workers, crash mid-job replay; 0 duplicate doses or notifications, lease recovery. | `npm run test:gate4` | PENDING | To be verified in Stage 4 |
| **Gate 5** | Backend permissions | Route-by-role matrix (owner, family, caregiver, cross-profile, revoked, anon) + instant revocation. | `npm run verify:stage2` | PASS (Stage 2 routes) | 16/16 tests passed. Anonymous rejected (401), cross-profile returns 404 (no existence leak), owner-only operations enforced (403), revoked member blocked immediately (404). |
| **Gate 6** | MISSED != TAKEN | Reminder opening/snooze != TAKEN; MISSED only by worker; adherence excludes unconfirmed; audit retained. | `npm run test:gate6` | PENDING | To be verified in Stage 3 & Stage 4 |
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
