import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { hashInvitationCode } from '../utils/crypto';
import { sendError } from '../utils/errors';
import { invitationAcceptLimiter } from '../middleware/rateLimit';
import { FamilyDefaultPermissions, CaregiverDefaultPermissions } from '@carebuddy/shared';

const router = Router();

const acceptInvitationSchema = z.object({
  code: z.string().min(1, 'Invitation code is required').trim(),
  relationshipLabel: z.string().optional()
});

/**
 * POST /api/invitations/accept
 * Accepts a care network invitation using a 10-character code
 */
router.post('/accept', requireAuth, invitationAcceptLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = acceptInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { code, relationshipLabel } = parseResult.data;
    const codeHash = hashInvitationCode(code);

    const invitation = await prisma.invitation.findFirst({
      where: { codeHash },
      include: {
        careNetwork: {
          include: { profile: true }
        }
      }
    });

    if (!invitation) {
      return sendError(res, 400, 'INVALID_INVITATION', 'Invalid, expired, or locked invitation code.');
    }

    // Check if invitation is locked or revoked or already used
    if (invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) {
      return sendError(res, 400, 'INVALID_INVITATION', 'Invalid, expired, or locked invitation code.');
    }

    // Check attempt limits
    if (invitation.attempts >= invitation.maxAttempts) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'LOCKED' }
      });
      return sendError(res, 400, 'INVITATION_LOCKED', 'Invitation locked due to too many failed attempts.');
    }

    // Check if caller is already an active member of this network
    const existingMembership = await prisma.careNetworkMember.findUnique({
      where: {
        careNetworkId_userId: {
          careNetworkId: invitation.careNetworkId,
          userId: req.user!.id
        }
      }
    });

    if (existingMembership && existingMembership.status === 'ACTIVE') {
      return sendError(res, 409, 'ALREADY_MEMBER', 'You are already an active member of this care network.');
    }

    // Determine permissions from role defaults or custom preset
    const defaults =
      invitation.role === 'FAMILY' ? FamilyDefaultPermissions : CaregiverDefaultPermissions;

    const preset = (invitation.permissionPreset as Record<string, boolean>) || {};
    const finalPermissions = {
      viewMedications: preset.viewMedications ?? defaults.viewMedications,
      viewAdherence: preset.viewAdherence ?? defaults.viewAdherence,
      viewAppointments: preset.viewAppointments ?? defaults.viewAppointments,
      viewActivity: preset.viewActivity ?? defaults.viewActivity,
      recordDoses: preset.recordDoses ?? defaults.recordDoses,
      addNotes: preset.addNotes ?? defaults.addNotes,
      manageMedications: preset.manageMedications ?? defaults.manageMedications,
      manageAppointments: preset.manageAppointments ?? defaults.manageAppointments,
      actOnBehalf: preset.actOnBehalf ?? defaults.actOnBehalf
    };

    const label = relationshipLabel || invitation.relationshipLabel || (invitation.role === 'FAMILY' ? 'Family Member' : 'Caregiver');

    await prisma.$transaction(async (tx) => {
      // 1. Mark invitation accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedByUserId: req.user!.id,
          acceptedAt: new Date()
        }
      });

      // 2. Create or reactivate membership
      if (existingMembership) {
        await tx.careNetworkMember.update({
          where: { id: existingMembership.id },
          data: {
            role: invitation.role,
            status: 'ACTIVE',
            relationshipLabel: label,
            ...finalPermissions
          }
        });
      } else {
        await tx.careNetworkMember.create({
          data: {
            careNetworkId: invitation.careNetworkId,
            userId: req.user!.id,
            role: invitation.role,
            status: 'ACTIVE',
            relationshipLabel: label,
            ...finalPermissions
          }
        });
      }

      // 3. Create AuditLog entry
      await tx.auditLog.create({
        data: {
          profileId: invitation.careNetwork.profileId,
          userId: req.user!.id,
          action: 'INVITATION_ACCEPTED',
          entityType: 'Invitation',
          entityId: invitation.id,
          details: {
            role: invitation.role,
            relationshipLabel: label,
            careNetworkId: invitation.careNetworkId
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      // 4. Create in-app notification for the profile owner
      const ownerMembership = await tx.careNetworkMember.findFirst({
        where: {
          careNetworkId: invitation.careNetworkId,
          role: 'OWNER',
          status: 'ACTIVE'
        }
      });

      if (ownerMembership) {
        const idempotencyKey = `INVITATION_ACCEPTED:${invitation.id}:${ownerMembership.userId}:once`;
        await tx.notification.create({
          data: {
            profileId: invitation.careNetwork.profileId,
            recipientId: ownerMembership.userId,
            type: 'INVITATION_ACCEPTED',
            title: 'New Member Joined',
            message: `${req.user!.name} joined as ${invitation.role.toLowerCase()} (${label}).`,
            entityId: invitation.id,
            idempotencyKey
          }
        }).catch(() => {});
      }
    });

    return res.json({
      success: true,
      profileId: invitation.careNetwork.profileId,
      profileName: invitation.careNetwork.profile.name,
      role: invitation.role
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

export default router;
