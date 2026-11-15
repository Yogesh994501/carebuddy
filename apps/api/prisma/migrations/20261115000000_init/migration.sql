-- CreateEnum
CREATE TYPE "NetworkRole" AS ENUM ('OWNER', 'FAMILY', 'CAREGIVER');

-- CreateEnum
CREATE TYPE "OwnerMode" AS ENUM ('DIRECT', 'ASSISTED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED', 'LOCKED');

-- CreateEnum
CREATE TYPE "DoseStatus" AS ENUM ('PENDING', 'SNOOZED', 'TAKEN', 'SKIPPED', 'MISSED');

-- CreateEnum
CREATE TYPE "DoseActionSource" AS ENUM ('OWNER_APP', 'CAREGIVER_APP', 'CAREGIVER_ASSISTED', 'CORRECTION', 'SYSTEM_WORKER');

-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISCONTINUED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'CUSTOM_TIMES', 'SELECTED_WEEKDAYS');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DOSE_UPCOMING', 'DOSE_MISSED', 'APPOINTMENT_UPCOMING', 'APPOINTMENT_CHANGED', 'MEDICATION_CHANGED', 'INVITATION_ACCEPTED', 'ACCESS_REVOKED', 'PERMISSIONS_CHANGED', 'CAREGIVER_ACTIVITY');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATE_DOSES', 'DOSE_UPCOMING', 'DOSE_MISSED_CHECK', 'APPOINTMENT_REMINDER');

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable RecoveryCode
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable ConsentRecord
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable ElderlyProfile
CREATE TABLE "ElderlyProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "preferredName" TEXT,
    "dateOfBirth" DATE,
    "bloodGroup" TEXT,
    "allergies" TEXT,
    "emergencyNotes" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "ownerMode" "OwnerMode" NOT NULL DEFAULT 'DIRECT',
    "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 15,
    "overdueGraceMinutes" INTEGER NOT NULL DEFAULT 60,
    "snoozeDurationMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxSnoozeCount" INTEGER NOT NULL DEFAULT 3,
    "aiConsent" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElderlyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable CareNetwork
CREATE TABLE "CareNetwork" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable CareNetworkMember
CREATE TABLE "CareNetworkMember" (
    "id" TEXT NOT NULL,
    "careNetworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "NetworkRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "relationshipLabel" TEXT,
    "isPrimaryDelegate" BOOLEAN NOT NULL DEFAULT false,
    "viewMedications" BOOLEAN NOT NULL DEFAULT true,
    "viewAdherence" BOOLEAN NOT NULL DEFAULT true,
    "viewAppointments" BOOLEAN NOT NULL DEFAULT true,
    "viewActivity" BOOLEAN NOT NULL DEFAULT true,
    "recordDoses" BOOLEAN NOT NULL DEFAULT false,
    "addNotes" BOOLEAN NOT NULL DEFAULT false,
    "manageMedications" BOOLEAN NOT NULL DEFAULT false,
    "manageAppointments" BOOLEAN NOT NULL DEFAULT false,
    "actOnBehalf" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareNetworkMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable Invitation
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "careNetworkId" TEXT NOT NULL,
    "role" "NetworkRole" NOT NULL,
    "relationshipLabel" TEXT,
    "codeHash" TEXT NOT NULL,
    "permissionPreset" JSONB,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable Medication
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "strength" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "medicineType" TEXT NOT NULL,
    "prescriptionDetails" TEXT,
    "prescriber" TEXT,
    "instructions" TEXT,
    "foodInstructions" TEXT,
    "refillQuantity" INTEGER,
    "refillReminderThreshold" INTEGER,
    "currentPillsRemaining" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "confirmedPrescriptionSource" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable MedicationSchedule
CREATE TABLE "MedicationSchedule" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "frequency" "ScheduleFrequency" NOT NULL,
    "timesOfDay" TEXT[] NOT NULL,
    "weekdays" INTEGER[] NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable MedicationDose
CREATE TABLE "MedicationDose" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "localTime" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "DoseStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntil" TIMESTAMPTZ(6),
    "takenAt" TIMESTAMPTZ(6),
    "confirmedByUserId" TEXT,
    "actionSource" "DoseActionSource",
    "actedOnBehalf" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "correctionReason" TEXT,
    "voidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationDose_pkey" PRIMARY KEY ("id")
);

-- CreateTable MedicationLog (Append-Only)
CREATE TABLE "MedicationLog" (
    "id" TEXT NOT NULL,
    "doseId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "DoseStatus" NOT NULL,
    "actionSource" "DoseActionSource" NOT NULL,
    "actedOnBehalf" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "previousState" "DoseStatus",
    "newState" "DoseStatus" NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable Appointment
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "doctor" TEXT NOT NULL,
    "specialty" TEXT,
    "clinic" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "localDate" TEXT NOT NULL,
    "localTime" TEXT NOT NULL,
    "address" TEXT,
    "contact" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "rescheduledFrom" TIMESTAMPTZ(6),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable CaregiverNote
CREATE TABLE "CaregiverNote" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "displayedAt" TIMESTAMPTZ(6),
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable NotificationPreference
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable ScheduledJob
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "type" "JobType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "runAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkerHeartbeat
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "lastHeartbeat" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditLog (Append-Only)
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserSettings
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textSize" TEXT NOT NULL DEFAULT '100',
    "elderlyMode" BOOLEAN NOT NULL DEFAULT false,
    "highContrast" BOOLEAN NOT NULL DEFAULT false,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable AssistantMessage
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- UNIQUE CONSTRAINTS
-- ============================================================================
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "CareNetwork_profileId_key" ON "CareNetwork"("profileId");
CREATE UNIQUE INDEX "CareNetworkMember_careNetworkId_userId_key" ON "CareNetworkMember"("careNetworkId", "userId");
CREATE UNIQUE INDEX "MedicationDose_scheduleId_localDate_localTime_key" ON "MedicationDose"("scheduleId", "localDate", "localTime");
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");
CREATE UNIQUE INDEX "NotificationPreference_userId_profileId_type_key" ON "NotificationPreference"("userId", "profileId", "type");
CREATE UNIQUE INDEX "ScheduledJob_idempotencyKey_key" ON "ScheduledJob"("idempotencyKey");
CREATE UNIQUE INDEX "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");
CREATE INDEX "ConsentRecord_userId_purpose_idx" ON "ConsentRecord"("userId", "purpose");
CREATE INDEX "ElderlyProfile_ownerUserId_idx" ON "ElderlyProfile"("ownerUserId");
CREATE INDEX "CareNetworkMember_userId_status_idx" ON "CareNetworkMember"("userId", "status");
CREATE INDEX "Invitation_codeHash_status_idx" ON "Invitation"("codeHash", "status");
CREATE INDEX "Invitation_careNetworkId_status_idx" ON "Invitation"("careNetworkId", "status");
CREATE INDEX "Medication_profileId_status_idx" ON "Medication"("profileId", "status");
CREATE INDEX "MedicationSchedule_medicationId_isActive_idx" ON "MedicationSchedule"("medicationId", "isActive");

-- Section 15 Required Indexes:
-- doses on (profileId, scheduledAt) and (status, scheduledAt)
CREATE INDEX "MedicationDose_profileId_scheduledAt_idx" ON "MedicationDose"("profileId", "scheduledAt");
CREATE INDEX "MedicationDose_status_scheduledAt_idx" ON "MedicationDose"("status", "scheduledAt");
CREATE INDEX "MedicationDose_profileId_status_scheduledAt_idx" ON "MedicationDose"("profileId", "status", "scheduledAt");

CREATE INDEX "MedicationLog_doseId_timestamp_idx" ON "MedicationLog"("doseId", "timestamp");
CREATE INDEX "MedicationLog_profileId_timestamp_idx" ON "MedicationLog"("profileId", "timestamp");

CREATE INDEX "Appointment_profileId_scheduledAt_idx" ON "Appointment"("profileId", "scheduledAt");
CREATE INDEX "Appointment_profileId_status_idx" ON "Appointment"("profileId", "status");

CREATE INDEX "CaregiverNote_profileId_createdAt_idx" ON "CaregiverNote"("profileId", "createdAt");

-- notifications on (recipientId, readAt, createdAt)
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_profileId_createdAt_idx" ON "Notification"("profileId", "createdAt");

-- jobs on (status, runAt)
CREATE INDEX "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");
CREATE INDEX "ScheduledJob_profileId_runAt_idx" ON "ScheduledJob"("profileId", "runAt");

CREATE INDEX "AuditLog_profileId_timestamp_idx" ON "AuditLog"("profileId", "timestamp");
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");

CREATE INDEX "AssistantMessage_profileId_userId_createdAt_idx" ON "AssistantMessage"("profileId", "userId", "createdAt");
CREATE INDEX "AssistantMessage_expiresAt_idx" ON "AssistantMessage"("expiresAt");

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareNetwork" ADD CONSTRAINT "CareNetwork_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareNetworkMember" ADD CONSTRAINT "CareNetworkMember_careNetworkId_fkey" FOREIGN KEY ("careNetworkId") REFERENCES "CareNetwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareNetworkMember" ADD CONSTRAINT "CareNetworkMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_careNetworkId_fkey" FOREIGN KEY ("careNetworkId") REFERENCES "CareNetwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationDose" ADD CONSTRAINT "MedicationDose_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationDose" ADD CONSTRAINT "MedicationDose_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationDose" ADD CONSTRAINT "MedicationDose_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_doseId_fkey" FOREIGN KEY ("doseId") REFERENCES "MedicationDose"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaregiverNote" ADD CONSTRAINT "CaregiverNote_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaregiverNote" ADD CONSTRAINT "CaregiverNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ElderlyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- APPEND-ONLY DATABASE TRIGGERS (Section 5.2 & Section 15)
-- MedicationLog and AuditLog are append-only, enforced by a database trigger that rejects UPDATE and DELETE.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_medication_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'MedicationLog is append-only. UPDATE and DELETE operations are strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_medication_log_immutable
BEFORE UPDATE OR DELETE ON "MedicationLog"
FOR EACH ROW EXECUTE FUNCTION check_medication_log_immutable();

CREATE OR REPLACE FUNCTION check_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only. UPDATE and DELETE operations are strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION check_audit_log_immutable();
