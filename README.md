# CareBuddy: Full-Stack AI-Powered Elderly Care & Medication Management Platform

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-carebuddy--kza6.onrender.com-brightgreen)](https://carebuddy-kza6.onrender.com)
[![Status](https://img.shields.io/badge/Release%20Gates-10%2F10%20PASS-success)](docs/VERIFICATION.md)

CareBuddy is a production-grade, full-stack, AI-powered healthcare and medication management system designed to keep elderly individuals at the center of their care network while providing real-time visibility, automated dose tracking, and safety guardrails for families and caregivers.

---

## 🌐 Live Production Deployment

- **Live Application**: [https://carebuddy-kza6.onrender.com](https://carebuddy-kza6.onrender.com)
- **API Health Check**: [https://carebuddy-kza6.onrender.com/health](https://carebuddy-kza6.onrender.com/health)
- **Database**: Cloud Neon Serverless PostgreSQL (`ap-southeast-1`)

### 👥 Interactive Demo Accounts
All accounts are pre-seeded with clinical records, schedules, and historical adherence:

| Role | Name | Email | Password |
|---|---|---|---|
| **Elderly (Owner)** | Ramesh Patel (72yo) | `ramesh.patel@carebuddy.local` | `DemoPassword123!` |
| **Family Caregiver** | Priya Patel (Daughter) | `priya.patel@carebuddy.local` | `DemoPassword123!` |
| **Caregiver Nurse** | Anita Sharma (RN) | `anita.sharma@carebuddy.local` | `DemoPassword123!` |

*Clicking "Reset Demo" from the web interface restores all 30 days of adherence history and appointments deterministically.*

---

## 1. System Architecture

```
                                  +---------------------------------------+
                                  |         CareBuddy Web (Vite/React)    |
                                  |  - Elderly View (56px touch targets)  |
                                  |  - Family View (Adherence & Timeline) |
                                  |  - Caregiver View (Assisted Doses)    |
                                  |  - Sprig Assistant Chat Drawer        |
                                  +-------------------+-------------------+
                                                      |
                                          REST APIs & SSE Stream
                                          (Opaque Session Cookies)
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |           CareBuddy API Server        |
                                  |  - Express / Helmet / CSRF / CORS     |
                                  |  - Argon2id Auth & Recovery Codes     |
                                  |  - Gate 5 IDOR & Role Permission RBAC |
                                  |  - Real-Time SSE (Zero Health Data)   |
                                  |  - Sprig Multi-Layer AI Pipeline      |
                                  +---------+-------------------+---------+
                                            |                   |
                     Prisma / Database Pool |                   | Job Queue
                                            v                   v
+---------------------------------------------+       +---------------------------------------------+
|          PostgreSQL 16+ Database            |       |          Background Scheduler Worker        |
|  - 21 Normalized Models                     | <---> |  - `FOR UPDATE SKIP LOCKED` Poll (1s-5s)    |
|  - Immutable Append-Only Triggers:          |       |  - 60s Lease with Heartbeat Sweeper         |
|    * MedicationLog & AuditLog (No UPD/DEL)  |       |  - Rolling 48h Dose Engine Generator        |
|  - Strict Timezone / DST Luxon Precision    |       |  - Worker-Only MISSED State Machine Enforcer|
|  - Zero Duplicate Doses / DLQ (5 Retries)   |       |  - 24h & 2h Appointment Reminders           |
+---------------------------------------------+       +---------------------------------------------+
                                            ^
                                            |
                      DPDP AI Consent & Structured Context Boundary
                                            |
                                            v
                              +---------------------------+
                              |    Gemini AI API Engine   |
                              |  - Emergency Short-Circuit|
                              |  - Untrusted Quarantining |
                              |  - Clinical Output Filter |
                              +---------------------------+
```

---

## 2. Monorepo Structure

- **`apps/web`**: React 18, Vite, Tailwind CSS, TanStack Query, Framer Motion, Lucide React, and WCAG 2.2 AA compliant UI.
- **`apps/api`**: Node 20+, Express, TypeScript, Zod schema validation, Helmet security headers, Argon2id password hashing, Prisma ORM, SSE broadcaster, and Gemini client (`@google/genai`).
- **`apps/api/src/worker.ts`**: Independent background worker polling database jobs via `FOR UPDATE SKIP LOCKED` with lease renewal and heartbeat reporting.
- **`packages/shared`**: Shared TypeScript types, domain enums, permission presets, and Zod schemas.
- **`docs/`**: Complete system documentation:
  - `docs/DECISIONS.md`: 22 Architecture Decision Records (ADRs).
  - `docs/VERIFICATION.md`: Verification evidence for all 10 Release Gates.
  - `docs/ADHERENCE.md`: Mathematical formulation for clinical adherence.
  - `docs/openapi.yaml`: Full OpenAPI 3.0 specification for all REST endpoints.
- **`scripts/`**: Automated verification and local orchestration scripts.

---

## 3. The Ten Release Gates (100% PASS ✅)

| Gate # | Name | Description | Verification Script | Status |
|---|---|---|---|---|
| **Gate 1** | **Persistence** | Create data, restart API, worker & database, log out and back in; everything persists. | `npm run verify:stage9` | PASS ✅ |
| **Gate 2** | **Background Scheduling** | With browser closed, worker polls via `SKIP LOCKED`, claims jobs, marks overdue doses MISSED. | `npm run verify:stage4` | PASS ✅ |
| **Gate 3** | **Timezone & DST** | Asia/Kolkata, America/New_York (spring/fall), Europe/London, Lord_Howe (30m DST). | `npm run verify:stage3` | PASS ✅ |
| **Gate 4** | **No Duplicates** | Concurrent workers running generation; 0 duplicate doses or notifications; DLQ recovery. | `npm run verify:stage4` | PASS ✅ |
| **Gate 5** | **Backend Permissions** | Route-by-role matrix (owner, family, caregiver, cross-profile IDOR defense, instant revocation). | `npm run verify:stage5` | PASS ✅ |
| **Gate 6** | **MISSED != TAKEN** | Snooze never creates TAKEN; max 3 snoozes; client cannot mark MISSED; history preserved. | `npm run verify:stage3` | PASS ✅ |
| **Gate 7** | **Synchronized Dashboards** | Multi-session SSE synchronizes dose/appointment state in ~350ms (< 2s SLA); zero health data. | `npm run verify:stage6` | PASS ✅ |
| **Gate 8** | **Mobile & Accessibility** | WCAG 2.2 AA contrast rules, 48px/56px touch targets, 3px focus visible, 100-200% text scaling. | `npm run verify:stage8` | PASS ✅ |
| **Gate 9** | **AI Safety (Sprig)** | Context builder isolation; emergency short-circuit; output filters; 30 red-team prompts passed. | `npm run verify:stage7` | PASS ✅ |
| **Gate 10** | **Demo Reliability** | Deterministic seed, all 4 demo accounts authenticate, survives reset twice, non-demo untouched. | `npm run verify:stage9` | PASS ✅ |

---

## 4. Quick Start & Local Development

### Prerequisites
- Node.js 20+ (with npm 10+)
- PostgreSQL 16+ (or use the built-in Embedded PostgreSQL engine)

### 1. Installation & Environment Setup
```bash
git clone https://github.com/Yogesh994501/carebuddy.git
cd carebuddy
npm install
cp .env.example .env
```

### 2. Database Migration & Embedded PostgreSQL
You can run local PostgreSQL with zero external dependencies:
```bash
# Starts embedded PostgreSQL on port 5432
npm run db:local

# In a separate terminal, apply schema & immutable triggers:
npm run prisma:migrate
```

### 3. Seed Demo Environment
Seed deterministic fictional data (Ramesh Patel, 5 medications, 3 appointments, 30 days of historical doses with ~90% adherence):
```bash
npm run seed:demo
```
**Demo Credentials**:
- **Elderly (Owner)**: `ramesh@demo.carebuddy.local` / `DemoPassword123!`
- **Family (Daughter)**: `priya@demo.carebuddy.local` / `DemoPassword123!`
- **Family (Son)**: `rahul@demo.carebuddy.local` / `DemoPassword123!`
- **Caregiver (RN)**: `anita@demo.carebuddy.local` / `DemoPassword123!`

### 4. Run Development Servers
```bash
# Start API Server (Port 4000)
npm --workspace=@carebuddy/api run dev

# Start Background Scheduler Worker (in a separate process)
npm --workspace=@carebuddy/api run worker

# Start Web Application (Port 5173)
npm --workspace=@carebuddy/web run dev
```

---

## 5. Verification & Testing

Every stage and release gate has an automated, standalone verification script:

```bash
# Run all stage verification suites
npm run verify:stage1      # Stage 1: Database Migration & Append-Only Triggers
npm run verify:stage2      # Stage 2: Auth, Authorization & Gate 5 Permissions
npm run verify:stage3      # Stage 3: Medications, Timezones, DST & State Machine (Gates 3, 4, 6)
npm run verify:stage4      # Stage 4: Background Worker, SKIP LOCKED & Notifications (Gates 2, 4)
npm run verify:stage5      # Stage 5: Appointments, Caregiver Notes & Activity Timeline
npm run verify:stage6      # Stage 6: Dashboards & Real-Time SSE Synchronization (Gate 7)
npm run verify:stage7      # Stage 7: AI Assistant (Sprig) & 30-Prompt Red-Team Suite (Gate 9)
npm run verify:stage8      # Stage 8: Accessibility, Responsive Design & WCAG 2.2 AA (Gate 8)
npm run verify:stage9      # Stage 9: Persistence (Gate 1) & Demo Reliability (Gate 10)
npm run verify:assistant   # Section 12a Sprig SVG & accessibility assets

# Complete monorepo typecheck & build
npm run typecheck
npm run build
```

---

## 6. Key Security & Compliance Invariants

### 1. Append-Only Clinical & Audit Logs
- PostgreSQL database triggers `check_medication_log_immutable()` and `check_audit_log_immutable()` reject `UPDATE` and `DELETE` operations at the engine level. Even root database callers cannot alter historical medication records.
- Correcting a MISSED dose appends a `CORRECTION` record; the original `MISSED` entry remains permanently preserved.

### 2. HIPAA & Real-Time Privacy
- Real-time Server-Sent Events (`GET /api/profiles/:profileId/events`) broadcast strictly opaque signals: `{ type, profileId, entityId }`.
- Zero medication names, clinical instructions, or note contents are ever transmitted over SSE. The frontend invalidates TanStack Query keys to fetch fresh data over authenticated, encrypted REST endpoints.
- Revoking a caregiver's access terminates their open SSE connection immediately (`res.end()`).

### 3. DPDP Act & AI Consent
- In compliance with the Digital Personal Data Protection (DPDP) Act, AI access to patient health data is gated by explicit consent (`ConsentRecord`).
- When consent is disabled or pending, health records (medications, doses, appointments, notes) are completely excluded from AI context.
- User-entered text is quarantined inside structural delimiters (`<<<UNTRUSTED_PATIENT_DATA>>>`) to prevent prompt injection and instruction overrides.
- Acute emergencies (chest pain, stroke symptoms, breathing difficulty, severe bleeding, overdose, self-harm) short-circuit immediately without calling Gemini, returning fixed 911 emergency guidance and alerting the care network.

### 4. Background Scheduler Invariants
- The background worker polls the `ScheduledJob` table using raw SQL `FOR UPDATE SKIP LOCKED`.
- Workers claim jobs with a 60-second lease and record periodic heartbeats in `WorkerHeartbeat`.
- Stalled jobs from crashed workers are reclaimed by `reclaimExpiredLeases()`.
- Unrecoverable jobs move to a Dead-Letter Queue (`DEAD`) after 5 failed attempts with exponential backoff.
- The `MISSED` status is strictly enforced by the background worker at `scheduledAt + overdueGraceMinutes`; client applications and snoozes are physically prevented from marking a dose `MISSED`.

---

## 7. Production Deployment Guidelines

1. **HTTPS & Cookie Security**: In production (`NODE_ENV=production`), ensure all cookies set `Secure: true`, `SameSite: strict`, and `HttpOnly: true`.
2. **Secrets Management**: Supply cryptographically strong secrets (minimum 32 characters) for `SESSION_SECRET` and `CSRF_SECRET` via environment variables.
3. **Dedicated Worker Process**: Run `npm --workspace=@carebuddy/api run worker` as an independent supervisor process (e.g. systemd, PM2, or separate Kubernetes pod) distinct from the web API.
4. **Gemini API & HIPAA Terms**: When deploying with Google Gemini (`GEMINI_API_KEY`), review and execute the appropriate Google Cloud Business Associate Agreement (BAA) and Zero Data Retention terms for clinical health data.
