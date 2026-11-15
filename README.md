# CareBuddy: AI-Powered Elderly Care & Medication Management Platform

CareBuddy is a secure, accessible healthcare and medication management system designed to keep elderly individuals at the center of their care network.

---

## 1. Monorepo Architecture

CareBuddy is structured as a TypeScript monorepo using npm workspaces:

- `apps/web`: React 18, Vite, Tailwind CSS, TanStack Query, Framer Motion, Lucide React, accessible elderly UI.
- `apps/api`: Node 20+, Express, TypeScript, Zod validation, Helmet, argon2id, Prisma ORM, SSE, Gemini AI service.
- `apps/api/src/worker.ts`: Independent background scheduler worker claiming jobs via `FOR UPDATE SKIP LOCKED`.
- `packages/shared`: Shared domain schemas, enums, types, and permission presets.
- `docs/`: Technical specifications, architectural decisions (`docs/DECISIONS.md`), adherence mathematical specification (`docs/ADHERENCE.md`), and verification matrix (`docs/VERIFICATION.md`).

---

## 2. Prerequisites & Local Setup

### System Requirements
- Node.js 20+
- npm 10+
- Docker & Docker Compose (optional; native embedded PostgreSQL is included for Docker-less environments)

### Quick Start
1. Clone the repository and navigate into the project root:
   ```bash
   cd carebuddy
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
3. Start local PostgreSQL:
   - **With Docker**:
     ```bash
     docker compose up -d
     ```
   - **Without Docker (Embedded Postgres)**:
     ```bash
     npm run db:local
     ```
4. Verify database migration:
   ```bash
   npm run verify:stage1
   ```

---

## 3. Database Schema & Append-Only Triggers

CareBuddy's data model contains 21 normalized models:
- **Authentication & Security**: `User`, `Session`, `RecoveryCode`, `ConsentRecord`, `UserSettings`
- **Care Network & Permissions**: `ElderlyProfile`, `CareNetwork`, `CareNetworkMember`, `Invitation`
- **Medications & Schedules**: `Medication`, `MedicationSchedule` (versioned), `MedicationDose`, `MedicationLog` (append-only)
- **Care Activities & Appointments**: `Appointment`, `CaregiverNote`, `Notification`, `NotificationPreference`
- **Background Scheduler & Health**: `ScheduledJob` (`FOR UPDATE SKIP LOCKED`), `WorkerHeartbeat`
- **Audit & AI**: `AuditLog` (append-only), `AssistantMessage`

### Append-Only Invariants
PostgreSQL triggers (`check_medication_log_immutable()` and `check_audit_log_immutable()`) enforce that `MedicationLog` and `AuditLog` records can **never** be updated or deleted by any API call or database user.

---

## 4. Current Stage Status

- **Stage 1 (Foundation)**: Complete ✅
  - Monorepo structure, Docker Compose, Prisma schema, 20261115000000_init migration, append-only triggers, env validation.
  - Verified against clean, empty database.
- **Stage 2 (Auth and Authorization)**: Complete ✅
  - Accounts (register, login, logout, password recovery with single-use codes), server sessions with HttpOnly cookies, argon2id.
  - Profile creation (DIRECT and ASSISTED modes with attestation), membership resolution per-request, permission middleware.
  - Care Network management, 10-character unambiguous invitation codes with HMAC-SHA256, atomic acceptance & revocation.
  - Gate 5 Matrix verified (16/16 tests passing).
- **Stage 3 (Medications and Dose Engine)**: Complete ✅
  - Medication CRUD, prescriber directions confirmation, versioned schedules, soft deletion.
  - Dose generation engine (48h rolling horizon, ON CONFLICT DO NOTHING duplicate prevention).
  - DST handling (Asia/Kolkata, America/New_York spring/fall, Europe/London, Australia/Lord_Howe 30-min shift) and timezone change regeneration.
  - State machine (conditional update, optimistic locking, snooze limits, worker-only MISSED, correction history preservation).
  - Adherence calculation service (`docs/ADHERENCE.md`).
  - Gates 3, 4 (generation), and 6 (transition) verified (13/13 tests passing).
- **Stage 4 (Worker and Notifications)**: Next stage.
