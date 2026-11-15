import { z } from 'zod';

// ============================================================================
// Roles & Permissions
// ============================================================================
export const NetworkRoleEnum = z.enum(['OWNER', 'FAMILY', 'CAREGIVER']);
export type NetworkRole = z.infer<typeof NetworkRoleEnum>;

export const OwnerModeEnum = z.enum(['DIRECT', 'ASSISTED']);
export type OwnerMode = z.infer<typeof OwnerModeEnum>;

export const MemberStatusEnum = z.enum(['ACTIVE', 'REVOKED']);
export type MemberStatus = z.infer<typeof MemberStatusEnum>;

export const InvitationStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
  'LOCKED'
]);
export type InvitationStatus = z.infer<typeof InvitationStatusEnum>;

export const PermissionFlagsSchema = z.object({
  viewMedications: z.boolean().default(true),
  viewAdherence: z.boolean().default(true),
  viewAppointments: z.boolean().default(true),
  viewActivity: z.boolean().default(true),
  recordDoses: z.boolean().default(false),
  addNotes: z.boolean().default(false),
  manageMedications: z.boolean().default(false),
  manageAppointments: z.boolean().default(false),
  actOnBehalf: z.boolean().default(false)
});
export type PermissionFlags = z.infer<typeof PermissionFlagsSchema>;

export const FamilyDefaultPermissions: PermissionFlags = {
  viewMedications: true,
  viewAdherence: true,
  viewAppointments: true,
  viewActivity: true,
  recordDoses: false,
  addNotes: false,
  manageMedications: false,
  manageAppointments: false,
  actOnBehalf: false
};

export const CaregiverDefaultPermissions: PermissionFlags = {
  viewMedications: true,
  viewAdherence: true,
  viewAppointments: true,
  viewActivity: true,
  recordDoses: true,
  addNotes: true,
  manageMedications: false,
  manageAppointments: false,
  actOnBehalf: false
};

// ============================================================================
// Dose & Medication Statuses
// ============================================================================
export const DoseStatusEnum = z.enum([
  'PENDING',
  'SNOOZED',
  'TAKEN',
  'SKIPPED',
  'MISSED'
]);
export type DoseStatus = z.infer<typeof DoseStatusEnum>;

export const DoseActionSourceEnum = z.enum([
  'OWNER_APP',
  'CAREGIVER_APP',
  'CAREGIVER_ASSISTED',
  'CORRECTION',
  'SYSTEM_WORKER'
]);
export type DoseActionSource = z.infer<typeof DoseActionSourceEnum>;

export const MedicationStatusEnum = z.enum([
  'ACTIVE',
  'PAUSED',
  'DISCONTINUED',
  'COMPLETED'
]);
export type MedicationStatus = z.infer<typeof MedicationStatusEnum>;

export const ScheduleFrequencyEnum = z.enum([
  'ONCE_DAILY',
  'TWICE_DAILY',
  'THREE_TIMES_DAILY',
  'CUSTOM_TIMES',
  'SELECTED_WEEKDAYS'
]);
export type ScheduleFrequency = z.infer<typeof ScheduleFrequencyEnum>;

export const AppointmentStatusEnum = z.enum([
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED'
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusEnum>;

export const NotificationTypeEnum = z.enum([
  'DOSE_UPCOMING',
  'DOSE_MISSED',
  'APPOINTMENT_UPCOMING',
  'APPOINTMENT_CHANGED',
  'MEDICATION_CHANGED',
  'INVITATION_ACCEPTED',
  'ACCESS_REVOKED',
  'PERMISSIONS_CHANGED',
  'CAREGIVER_ACTIVITY'
]);
export type NotificationType = z.infer<typeof NotificationTypeEnum>;

export const JobStatusEnum = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'DEAD',
  'EXPIRED'
]);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const JobTypeEnum = z.enum([
  'GENERATE_DOSES',
  'DOSE_UPCOMING',
  'DOSE_MISSED_CHECK',
  'APPOINTMENT_REMINDER'
]);
export type JobType = z.infer<typeof JobTypeEnum>;
