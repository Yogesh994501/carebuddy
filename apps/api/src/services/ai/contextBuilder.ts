import { prisma } from '../../db/prisma';
import { CareNetworkMember } from '@prisma/client';
import { calculateAdherence } from '../adherence';
import { DateTime } from 'luxon';

export interface AssistantContext {
  consentGranted: boolean;
  elderlyFirstName: string;
  callerRole: string;
  timezone: string;
  currentLocalDate: string;
  medications?: Array<{
    name: string;
    strength: string;
    dosage: string;
    instructions: string;
  }>;
  todayDoses?: Array<{
    medicationName: string;
    time: string;
    status: string;
    snoozeCount: number;
  }>;
  appointments?: Array<{
    doctor: string;
    clinic: string;
    date: string;
    time: string;
  }>;
  adherenceSummary?: {
    rate: number | null;
    statusText: string;
  };
  caregiverNotes?: Array<{
    note: string;
    date: string;
    isFlagged: boolean;
  }>;
}

/**
 * Sanitizes untrusted user strings into safe structural delimiters
 */
export function wrapUntrustedData(input: string): string {
  if (!input) return '';
  // Strip delimiter escape attempts
  const cleaned = input
    .replace(/<<<UNTRUSTED_PATIENT_DATA>>>/g, '[DATA_TAG]')
    .replace(/<<<END_UNTRUSTED_PATIENT_DATA>>>/g, '[END_DATA_TAG]');

  return `<<<UNTRUSTED_PATIENT_DATA>>>\n${cleaned}\n<<<END_UNTRUSTED_PATIENT_DATA>>>`;
}

/**
 * Checks if the profile owner has granted active AI assistant consent
 */
export async function isAiConsentActive(profileId: string, ownerUserId: string | null): Promise<boolean> {
  const profile = await prisma.elderlyProfile.findUnique({
    where: { id: profileId },
    select: { aiConsent: true, ownerUserId: true }
  });

  if (!profile) return false;
  if (profile.aiConsent) return true;

  const resolvedOwnerId = ownerUserId || profile.ownerUserId;
  if (!resolvedOwnerId) return false;

  const activeConsent = await prisma.consentRecord.findFirst({
    where: {
      userId: resolvedOwnerId,
      purpose: 'AI_ASSISTANT',
      granted: true,
      revokedAt: null
    },
    orderBy: { grantedAt: 'desc' }
  });

  return Boolean(activeConsent);
}

/**
 * Builds permission-scoped contextual summary for Sprig
 */
export async function buildAssistantContext(
  profileId: string,
  callerMember: CareNetworkMember
): Promise<AssistantContext> {
  const profile = await prisma.elderlyProfile.findUnique({
    where: { id: profileId }
  });

  if (!profile) {
    throw new Error('Profile not found');
  }

  const consentGranted = await isAiConsentActive(profileId, profile.ownerUserId);
  const firstName = profile.name.trim().split(/\s+/)[0] || 'Patient';
  const tz = profile.timezone || 'UTC';
  const now = DateTime.now().setZone(tz);
  const todayStr = now.toISODate()!;

  // If consent is not active, return minimal context containing zero health records
  if (!consentGranted) {
    return {
      consentGranted: false,
      elderlyFirstName: firstName,
      callerRole: callerMember.role,
      timezone: tz,
      currentLocalDate: todayStr
    };
  }

  const context: AssistantContext = {
    consentGranted: true,
    elderlyFirstName: firstName,
    callerRole: callerMember.role,
    timezone: tz,
    currentLocalDate: todayStr
  };

  // 1. Medications & Today's Doses (if caller has viewMedications)
  if (callerMember.viewMedications) {
    const meds = await prisma.medication.findMany({
      where: { profileId, status: 'ACTIVE' },
      select: {
        name: true,
        strength: true,
        dosage: true,
        instructions: true
      }
    });

    context.medications = meds.map((m) => ({
      name: m.name,
      strength: m.strength,
      dosage: m.dosage,
      instructions: wrapUntrustedData(m.instructions || 'Take as directed')
    }));

    const doses = await prisma.medicationDose.findMany({
      where: {
        profileId,
        localDate: todayStr,
        voidedAt: null
      },
      include: {
        medication: { select: { name: true } }
      },
      orderBy: { localTime: 'asc' }
    });

    context.todayDoses = doses.map((d) => ({
      medicationName: d.medication.name,
      time: d.localTime,
      status: d.status,
      snoozeCount: d.snoozeCount
    }));
  }

  // 2. Appointments (if caller has viewAppointments)
  if (callerMember.viewAppointments) {
    const apts = await prisma.appointment.findMany({
      where: {
        profileId,
        status: 'SCHEDULED',
        localDate: { gte: todayStr }
      },
      orderBy: [{ localDate: 'asc' }, { localTime: 'asc' }],
      take: 5
    });

    context.appointments = apts.map((a) => ({
      doctor: wrapUntrustedData(a.doctor),
      clinic: wrapUntrustedData(a.clinic),
      date: a.localDate,
      time: a.localTime
    }));
  }

  // 3. Adherence (if caller has viewAdherence)
  if (callerMember.viewAdherence) {
    const adherence = await calculateAdherence(profileId, '7d');
    context.adherenceSummary = {
      rate: adherence.overall.percentage,
      statusText: adherence.overall.label
    };
  }

  // 4. Caregiver Notes (if caller has viewActivity)
  if (callerMember.viewActivity) {
    const notes = await prisma.caregiverNote.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: 3
    });

    context.caregiverNotes = notes.map((n) => ({
      note: wrapUntrustedData(n.note),
      date: DateTime.fromJSDate(n.createdAt).setZone(tz).toFormat('yyyy-MM-dd HH:mm'),
      isFlagged: n.isFlagged
    }));
  }

  return context;
}
