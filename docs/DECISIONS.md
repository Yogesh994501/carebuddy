# Architecture and Engineering Decisions (docs/DECISIONS.md)

This log records architectural, security, and infrastructure decisions made during the implementation of CareBuddy, following Section 0 (Rule 4) and Section 2 of the prompt.

---

### DECISION-001: Monorepo Structure and Package Manager
- **Context**: Section 2 specifies `apps/web`, `apps/api` (API plus a worker entry point), `packages/shared` (Zod schemas, types), and `docs/`.
- **Decision**: Use npm workspaces at the monorepo root (`apps/*`, `packages/*`).
- **Rationale**: Built-in support in Node 20+, zero external dependencies required for monorepo workspace orchestration.

### DECISION-002: Dual Local PostgreSQL Execution (Docker Compose + Embedded PostgreSQL)
- **Context**: Section 2 specifies PostgreSQL 16 with Prisma and migrations via Docker Compose. On systems or environments without Docker Desktop active, automated testing and migration verification must still execute against a real, authentic PostgreSQL engine.
- **Decision**: 
  1. Provide standard `docker-compose.yml` configured for PostgreSQL 16 Alpine with healthcheck, persistent volume, and port 5432.
  2. Provide a self-contained local runner (`npm run db:local`) using native `@embedded-postgres` (PostgreSQL 16/18 binaries) for automated testing, CI, and environments without Docker.
- **Rationale**: Guarantees Section 16 Gate 1 and Stage 1 exit criteria ("migrates cleanly on an empty database") can execute reliably across both Dockerized and native Windows host environments without mocking or compromising the true PostgreSQL engine.

### DECISION-003: Append-Only Triggers via Native PostgreSQL Triggers
- **Context**: Section 5.2 and Section 15 mandate that `MedicationLog` and `AuditLog` are strictly append-only, enforced at the database level by rejecting `UPDATE` and `DELETE`.
- **Decision**: Implement native PL/pgSQL functions `check_medication_log_immutable()` and `check_audit_log_immutable()` and attach `BEFORE UPDATE OR DELETE` triggers in the initial migration script.
- **Rationale**: Enforcing immutability in the database kernel prevents accidental or intentional tampering via raw SQL, Prisma, or manual database connections.

### DECISION-004: Strict Environment Variable Validation
- **Context**: Section 2 and Section 11 require robust security configuration, Helmet CSP, argon2id, session secret, and Gemini API key handling.
- **Decision**: Validate all environment variables through Zod at server and worker startup (`apps/api/src/config/env.ts`), failing immediately with descriptive errors if required variables are missing or misconfigured.
- **Rationale**: Prevents insecure runtime defaults, missing secrets, or accidental leaks.

### DECISION-005: Normalized Data Model & Enums
- **Context**: Section 15 requires all 21 models, indexes, check constraints, and unique constraints.
- **Decision**: Map all domain roles, statuses, and action sources directly into PostgreSQL ENUMs (`NetworkRole`, `OwnerMode`, `MemberStatus`, `InvitationStatus`, `MedicationStatus`, `ScheduleFrequency`, `DoseStatus`, `DoseActionSource`, `AppointmentStatus`, `NotificationType`, `JobStatus`).
- **Rationale**: Guarantees type safety at the database layer and prevents invalid state transitions.

### DECISION-006: Server-Side Sessions & Single-Use Recovery Codes
- **Context**: Section 2 and Section 4 dictate that authentication uses server-side sessions stored in PostgreSQL with opaque random IDs in HttpOnly cookies, argon2id password hashing, and 8 single-use recovery codes for password recovery.
- **Decision**: Implement `Session` with 64-hex-char opaque tokens in PostgreSQL, setting cookies with `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Recovery codes are hashed with argon2id and marked `usedAt` upon consumption, with an atomic transaction that revokes all active sessions for the user.
- **Rationale**: Eliminates client-side JWT token leakage in `localStorage` and guarantees that compromised credentials or reset events invalidate all existing sessions instantly.

### DECISION-007: Safe 404 Responses for Unauthorized Profile Access
- **Context**: Section 11 requires that requesting a resource belonging to a profile the caller cannot access returns 404 rather than 403, preventing resource existence leakage.
- **Decision**: In `resolveProfileMembership` middleware, if a profile ID does not exist OR if the authenticated caller is not an active member of that profile's care network, the middleware returns `404 PROFILE_NOT_FOUND`.
- **Rationale**: Prevents malicious enumeration or direct object reference attacks (IDOR) from discovering valid profile IDs.

### DECISION-008: Uncached Per-Request Membership & Permission Resolution
- **Context**: Section 3 mandates that permissions are read from the database on every request (no caching beyond the request) so that revocation takes effect on the next call.
- **Decision**: `resolveProfileMembership` queries PostgreSQL on every protected request.
- **Rationale**: Ensures zero latency between an owner revoking a member or altering permissions and the enforcement taking effect.

### DECISION-009: Dose Generation Horizon and Idempotency Constraint
- **Context**: Section 5.1 & Section 6 require a 48-hour dose generation horizon, with zero duplicates created during concurrent runs or crash replays.
- **Decision**: Implement `INSERT ... ON CONFLICT ("scheduleId", "localDate", "localTime") DO NOTHING` in `doseGenerator.ts`.
- **Rationale**: Database-level unique constraint provides absolute mathematical protection against duplicate doses, even under distributed worker race conditions.

### DECISION-010: DST Transition Disambiguation Strategy
- **Context**: Section 6 specifies that spring-forward nonexistent local times move to the first valid instant after the gap (03:00) and fall-back ambiguous local times use the first occurrence.
- **Decision**: In `resolveWallClockInstant`, detect gaps by comparing formatted local time against requested wall-clock time and advance to the first valid minute; for fall-back, compute offset relative to day start.
- **Rationale**: Avoids dropped doses or double generation on DST transition days across America/New_York, Europe/London, and 30-minute shift zones like Australia/Lord_Howe.

### DECISION-011: Strict System Worker Isolation for MISSED Marking
- **Context**: Section 5.2 and Section 16 (Gate 6) mandate that `MISSED` can only be set by the background system worker at the grace deadline, never by client apps or snooze actions.
- **Decision**: In `doseStateMachine.ts`, transition to `MISSED` strictly checks `actionSource === 'SYSTEM_WORKER'` and throws an error for all other callers.
- **Rationale**: Guarantees that clinical intake history cannot be distorted by client-side actions.

### DECISION-012: Atomic Background Job Claiming via FOR UPDATE SKIP LOCKED
- **Context**: Section 6 and Section 16 (Gate 4) require a background worker process claiming jobs concurrently without double-processing or distributed lock contention.
- **Decision**: Execute raw SQL `UPDATE "ScheduledJob" SET status = 'RUNNING', "lockedBy" = $1, "lockedUntil" = NOW() + INTERVAL '60 seconds', "attempts" = "attempts" + 1 WHERE id IN (SELECT id FROM "ScheduledJob" WHERE status = 'QUEUED' AND "runAt" <= NOW() ORDER BY "runAt" ASC LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING *`.
- **Rationale**: Native database row locks with `SKIP LOCKED` provide maximum throughput and complete immunity to duplicate claims across horizontally scaled workers without requiring Redis or external message brokers.

### DECISION-013: 60-Second Lease Heartbeat and Crash Recovery Sweeper
- **Context**: Section 6 requires workers to lease jobs for 60 seconds with heartbeats, and recover gracefully from mid-job worker crashes.
- **Decision**: Running jobs maintain an active 60-second lease via `extendLease`. The background reconciler runs `reclaimExpiredLeases()` every 60 seconds, which detects jobs with `status = 'RUNNING'` and `lockedUntil < NOW()`, re-queues them if `attempts < maxAttempts`, or moves them to `DEAD` if attempts reach 5.
- **Rationale**: Prevents orphaned jobs from blocking the queue if a worker dies, while preventing infinite poison pill retry loops via the Dead Letter Queue.

### DECISION-014: In-App Only Notification Channel & Idempotency Key Architecture
- **Context**: Section 1 and Section 7 specify that SMS and email delivery are strictly out of scope, while notifications must be in-app only, behind a channel interface so other delivery mechanisms can be integrated in the future.
- **Decision**: Implemented `NotificationChannel` interface with `InAppChannel` implementation. User preferences (`NotificationPreference`) are respected per notification type. Unique compound key `${type}:${profileId}:${recipientId}:${entityId}:${occurrenceKey}` prevents duplicate notifications even on job retries.
- **Rationale**: Meets strict prompt scope constraints and ensures zero fake emails or mock delivery services are present.

### DECISION-015: Non-ASCII Error Message Sanitization for Database Interoperability
- **Context**: On Windows native PostgreSQL environments initialized with system locale encodings (e.g. WIN1252), storing UTF-8 Unicode characters such as Prisma error symbols (`→`) in VARCHAR columns throws PostgreSQL error `22P05`.
- **Decision**: In `jobQueue.ts`, sanitize error strings via `.replace(/[^\x00-\x7F]/g, '->')` prior to persisting to `lastError`.
- **Rationale**: Guarantees database stability across all operating systems and database character sets without data loss.



