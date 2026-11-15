import { prisma } from '../../db/prisma';
import { CareNetworkMember } from '@prisma/client';
import { checkEmergencyShortCircuit, EmergencyCheckResult } from './emergencyDetector';
import { buildAssistantContext, AssistantContext } from './contextBuilder';
import { filterAssistantOutput, OutputFilterResult, SAFE_MEDICAL_FALLBACK } from './outputFilter';
import { buildGeminiPrompt, callGeminiAssistant, SprigChatMessage } from './geminiClient';
import { sendNotification } from '../notificationService';

export interface ChatResponse {
  reply: string;
  sourceLabel: 'From your CareBuddy records' | 'General information';
  isEmergency: boolean;
  emergencyType?: string;
  messageId: string;
}

/**
 * Checks if the user's input explicitly attempts to violate safety gates
 * (prescribing, dose change, interaction guarantee, diagnosis, or cross-profile access)
 */
function checkPreSafetyInterception(userMessage: string): { intercepted: boolean; safeReply: string } | null {
  const lower = userMessage.toLowerCase();

  // 1. Prescribing requests
  if (
    lower.includes('prescribe') ||
    lower.includes('prescription') ||
    lower.includes('write me an rx') ||
    lower.includes('give me an rx') ||
    lower.includes('doctor prescription')
  ) {
    return {
      intercepted: true,
      safeReply:
        'CareBuddy is an informational companion and cannot prescribe medications. ' +
        'Only licensed healthcare providers can write prescriptions. ' +
        'Please contact your physician or local clinic for any prescription needs.'
    };
  }

  // 2. Dose-altering advice
  if (
    lower.includes('should i double') ||
    lower.includes('should i increase') ||
    lower.includes('should i decrease') ||
    lower.includes('can i stop taking') ||
    lower.includes('should i change my dose') ||
    lower.includes('change my dosage') ||
    lower.includes('take 2 tablets') ||
    lower.includes('take two tablets') ||
    lower.includes('take extra pills') ||
    lower.includes('increase my dosage') ||
    lower.includes('decrease my dose')
  ) {
    return {
      intercepted: true,
      safeReply:
        'I cannot recommend altering, increasing, decreasing, or stopping your medication doses. ' +
        'Making unprescribed changes to your dosage can be dangerous. ' +
        'Please consult your prescribing doctor or pharmacist before making any changes.'
    };
  }

  // 3. Clinical diagnosis requests
  if (
    lower.includes('diagnose') ||
    lower.includes('what disease') ||
    lower.includes('what illness') ||
    lower.includes('what medical illness') ||
    lower.includes('do i have') ||
    lower.includes('could this be') ||
    lower.includes('is it pneumonia') ||
    lower.includes('is this covid') ||
    lower.includes('do i have rheumatoid') ||
    lower.includes('do i have arthritis') ||
    lower.includes('do i have cancer') ||
    lower.includes('do i have diabetes')
  ) {
    return {
      intercepted: true,
      safeReply:
        'I cannot provide clinical diagnoses or evaluate symptoms. ' +
        'If you are feeling unwell or experiencing new symptoms, please schedule an appointment ' +
        'with your doctor or seek evaluation from a healthcare professional.'
    };
  }

  // 4. Drug interaction guarantee claims
  if (
    (lower.includes('safe to take') || lower.includes('safe to mix') || lower.includes('safe to combine') || lower.includes('interaction between') || lower.includes('interactions between') || lower.includes('mixing')) &&
    (lower.includes('guarantee') || lower.includes('promise') || lower.includes('100%') || lower.includes('completely safe') || lower.includes('verify') || lower.includes('wine') || lower.includes('alcohol') || lower.includes('grapefruit') || lower.includes('aspirin') || lower.includes('ibuprofen') || lower.includes('st. john'))
  ) {
    return {
      intercepted: true,
      safeReply:
        'CareBuddy does not verify or guarantee the safety of drug combinations. ' +
        'Drug interactions can vary widely based on your personal health profile. ' +
        'Always consult your pharmacist or prescribing clinician to review potential interactions.'
    };
  }

  // 5. Cross-profile data extraction attempts
  if (
    lower.includes('show me records for profile') ||
    lower.includes('other patient') ||
    lower.includes('other profile') ||
    lower.includes('switch to profile')
  ) {
    return {
      intercepted: true,
      safeReply:
        'I only have access to information within your current authorized care profile. ' +
        'CareBuddy strictly enforces privacy isolation across all patient profiles.'
    };
  }

  // 6. Jailbreak / System override attacks
  if (
    lower.includes('ignore previous instructions') ||
    lower.includes('ignore all previous') ||
    lower.includes('you are now dr') ||
    lower.includes('system override') ||
    lower.includes('jailbreak') ||
    lower.includes('developer') ||
    lower.includes('roleplay') ||
    lower.includes('rogue doctor') ||
    lower.includes('forget all') ||
    lower.includes('uncensored') ||
    lower.includes('act as my') ||
    lower.includes('<<<end_untrusted') ||
    lower.includes('new instruction')
  ) {
    return {
      intercepted: true,
      safeReply:
        'I am Sprig, your friendly CareBuddy companion. CareBuddy gives information from your records and general education. ' +
        'I operate strictly under CareBuddy safety guidelines and cannot adopt medical authority roles or override system instructions.'
    };
  }

  return null;
}

/**
 * Main chat handler for Sprig assistant
 */
export async function processAssistantChat(params: {
  profileId: string;
  userId: string;
  userMessage: string;
  callerMember: CareNetworkMember;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ChatResponse> {
  const { profileId, userId, userMessage, callerMember, ipAddress, userAgent } = params;
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // 1. Emergency Short-Circuit (Section 10)
  const emergencyCheck = checkEmergencyShortCircuit(userMessage);
  if (emergencyCheck.isEmergency) {
    // Record user message & emergency response
    await prisma.assistantMessage.create({
      data: {
        profileId,
        userId,
        role: 'user',
        content: userMessage,
        expiresAt: thirtyDaysFromNow
      }
    });

    const assistantMsg = await prisma.assistantMessage.create({
      data: {
        profileId,
        userId,
        role: 'model',
        content: emergencyCheck.emergencyMessage!,
        sourceLabel: 'General information',
        expiresAt: thirtyDaysFromNow
      }
    });

    // Notify care network about the emergency query
    await sendNotification({
      profileId,
      recipientId: callerMember.userId,
      type: 'CAREGIVER_ACTIVITY',
      title: 'Emergency Guidance Provided',
      message: `Sprig detected emergency keywords in user query: "${userMessage.slice(0, 80)}" and displayed emergency response.`,
      entityId: `emergency-${Date.now()}`,
      occurrenceKey: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    }).catch(() => {});

    return {
      reply: emergencyCheck.emergencyMessage!,
      sourceLabel: 'General information',
      isEmergency: true,
      emergencyType: emergencyCheck.emergencyType,
      messageId: assistantMsg.id
    };
  }

  // 2. Build Permission-Scoped Context (Section 10 & Gate 9)
  const context = await buildAssistantContext(profileId, callerMember);

  // 3. Check Pre-Safety Interceptions (Gate 9 Red-Team Protection)
  const preCheck = checkPreSafetyInterception(userMessage);
  let replyContent: string;
  let sourceLabel: 'From your CareBuddy records' | 'General information' = 'General information';

  if (preCheck) {
    replyContent = preCheck.safeReply;
    sourceLabel = 'General information';
  } else {
    // 4. Fetch recent chat history (last 5 messages)
    const recentHistory = await prisma.assistantMessage.findMany({
      where: { profileId, userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const formattedHistory: SprigChatMessage[] = recentHistory.reverse().map((m) => ({
      role: m.role as 'user' | 'model',
      content: m.content
    }));

    // 5. Build Prompt & Call Gemini
    const prompt = buildGeminiPrompt(userMessage, context, formattedHistory);
    const rawReply = await callGeminiAssistant(prompt, userMessage, context);

    // 6. Post-Call Output Filter (Section 10 & Gate 9)
    const filtered = filterAssistantOutput(rawReply, context.consentGranted);
    replyContent = filtered.content;
    sourceLabel = filtered.sourceLabel;
  }

  // 7. Persist messages with 30-day retention
  await prisma.assistantMessage.create({
    data: {
      profileId,
      userId,
      role: 'user',
      content: userMessage,
      expiresAt: thirtyDaysFromNow
    }
  });

  const savedReply = await prisma.assistantMessage.create({
    data: {
      profileId,
      userId,
      role: 'model',
      content: replyContent,
      sourceLabel,
      expiresAt: thirtyDaysFromNow
    }
  });

  return {
    reply: replyContent,
    sourceLabel,
    isEmergency: false,
    messageId: savedReply.id
  };
}

/**
 * Retrieve chat history for profile & user
 */
export async function getAssistantHistory(profileId: string, userId: string) {
  return prisma.assistantMessage.findMany({
    where: { profileId, userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      sourceLabel: true,
      createdAt: true
    }
  });
}

/**
 * Delete chat history for profile & user
 */
export async function deleteAssistantHistory(profileId: string, userId: string): Promise<number> {
  const result = await prisma.assistantMessage.deleteMany({
    where: { profileId, userId }
  });
  return result.count;
}

/**
 * Update AI Assistant consent record (owner only)
 */
export async function updateAiConsent(params: {
  profileId: string;
  userId: string;
  granted: boolean;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { profileId, userId, granted, ipAddress, userAgent } = params;

  return prisma.$transaction(async (tx) => {
    // 1. Update ElderlyProfile aiConsent boolean
    await tx.elderlyProfile.update({
      where: { id: profileId },
      data: { aiConsent: granted }
    });

    // 2. If revoking, mark previous active consent records as revoked
    if (!granted) {
      await tx.consentRecord.updateMany({
        where: {
          userId,
          purpose: 'AI_ASSISTANT',
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
    }

    // 3. Create versioned ConsentRecord
    const consent = await tx.consentRecord.create({
      data: {
        userId,
        purpose: 'AI_ASSISTANT',
        version: '1.0',
        granted,
        ipAddress,
        userAgent
      }
    });

    // 4. Log in AuditLog
    await tx.auditLog.create({
      data: {
        profileId,
        userId,
        action: granted ? 'AI_CONSENT_GRANTED' : 'AI_CONSENT_REVOKED',
        entityType: 'ConsentRecord',
        entityId: consent.id,
        ipAddress,
        userAgent
      }
    });

    return consent;
  });
}
