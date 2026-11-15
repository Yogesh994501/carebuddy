# Design Specification: Stage 1 Foundation and Data Model

## 1. Overview & Architectural Context
CareBuddy is an AI-powered elderly care and medication management platform built to coordinate daily medication schedules, appointments, and care-network workflows while keeping the elderly person at the center of all authorization decisions.

This specification defines the foundational platform layer:
1. Monorepo architecture (`apps/web`, `apps/api`, `packages/shared`, `docs/`)
2. Relational schema (PostgreSQL 16) with 21 normalized models
3. Append-only tamper-proof audit triggers
4. Environment configuration and validation rules

## 2. Invariants & Security Principles
- **Append-Only Immutability**: Neither the API nor database users may update or delete records from `MedicationLog` and `AuditLog`. This is enforced by database triggers.
- **Dose Uniqueness**: For any schedule, only one dose can exist for a given `(localDate, localTime)` slot.
- **Job & Notification Idempotency**: All background jobs and notifications must use a unique `idempotencyKey` inserted with `ON CONFLICT DO NOTHING`.
- **Timezone Invariance**: Wall-clock schedules are stored alongside timezone identifiers and converted to UTC timestamptz instants using Luxon.

## 3. Data Model Summary (21 Entities)
1. `User` (Authentication principal)
2. `Session` (Server-side opaque random session stored in DB)
3. `RecoveryCode` (Hashed single-use recovery codes)
4. `ConsentRecord` (DPDP/consent tracking)
5. `ElderlyProfile` (Core healthcare profile)
6. `CareNetwork` (Network container)
7. `CareNetworkMember` (RBAC & permissions)
8. `Invitation` (Hashed invite tokens & expiration)
9. `Medication` (Medication details & prescriber confirmation)
10. `MedicationSchedule` (Versioned schedule definitions)
11. `MedicationDose` (Materialized dose instances)
12. `MedicationLog` (Append-only state transition records)
13. `Appointment` (Medical appointments & statuses)
14. `CaregiverNote` (Clinical and caregiver observations)
15. `Notification` (In-app notifications)
16. `NotificationPreference` (Per-user preference toggles)
17. `ScheduledJob` (SKIP LOCKED worker queue)
18. `WorkerHeartbeat` (Worker health monitoring)
19. `AuditLog` (Append-only audit trail)
20. `UserSettings` (Accessibility and UX preferences)
21. `AssistantMessage` (AI assistant conversation history)

## 4. Migration Strategy
All tables and triggers are declared in `apps/api/prisma/schema.prisma` and generated in initial SQL migration `apps/api/prisma/migrations/20261115000000_init/migration.sql`.
Verification is performed against an empty PostgreSQL database instance.
