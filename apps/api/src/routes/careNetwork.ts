import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requireOwner } from '../middleware/profile';
import { generateRandomCode, hashInvitationCode } from '../utils/crypto';
import { sendError } from '../utils/errors';
import { invitationAcceptLimiter } from '../middleware/rateLimit';
import { FamilyDefaultPermissions, CaregiverDefaultPermissions } from '@carebuddy/shared';

const router = Router({ mergeParams: true });

const createInvitationSchema = z.object({
  role: z.enum(['FAMILY', 'CAREGIVER']),
  relationshipLabel: z.string().optional(),
  permissionPreset: z.record(z.boolean()).optional()
});

const updateMemberSchema = z.object({
  relationshipLabel: z.string().optional(),
  permissions: z
    .object({
      viewMedications: z.boolean().optional(),
      viewAdherence: z.boolean().optional(),
      viewAppointments: z.boolean().optional(),
      viewActivity: z.boolean().optional(),
      recordDoses: z.boolean().optional(),
      addNotes: z.boolean().optional(),
      manageMedications: z.boolean().optional(),
      manageAppointments: z.boolean().optional(),
      actOnBehalf: z.boolean().optional()
    })
    .optional()
});

/**
 * GET /api/profiles/:profileId/care-network
 * Lists care network members and active invitations
 */
router.get('/', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
  try {
    const careNetwork = await prisma.careNetwork.findUnique({
      where: { profileId: req.profile!.id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        invitations: {
          where: { status: 'PENDING', expiresAt: { gt: new Date() } },
          select: {
            id: true,
            role: true,
            relationshipLabel: true,
            status: true,
            expiresAt: true,
            createdAt: true
          }
        }
      }
    });

    if (!careNetwork) {
      return sendError(res, 404, 'NETWORK_NOT_FOUND', 'Care network not found.');
    }

    // Only owner sees pending invitations
    const invitations = req.isOwnerOrPrimaryDelegate ? careNetwork.invitations : [];

    return res.json({
      members: careNetwork.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        status: m.status,
        relationshipLabel: m.relationshipLabel,
        isPrimaryDelegate: m.isPrimaryDelegate,
        permissions: {
          viewMedications: m.viewMedications,
          viewAdherence: m.viewAdherence,
          viewAppointments: m.viewAppointments,
          viewActivity: m.viewActivity,
          recordDoses: m.recordDoses,
          addNotes: m.addNotes,
          manageMedications: m.manageMedications,
          manageAppointments: m.manageAppointments,
          actOnBehalf: m.actOnBehalf
        },
        createdAt: m.createdAt
      })),
      invitations
    });
  } catch (error) {
    console.error('List care network error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/profiles/:profileId/invitations
 * Generates an invitation code (10-char, unambiguous). Owner-only.
 * Returns the unhashed code ONCE.
 */
router.post('/invitations', requireAuth, resolveProfileMembership, requireOwner, async (req: Request, res: Response) => {
  try {
    const parseResult = createInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { role, relationshipLabel, permissionPreset } = parseResult.data;

    // 10-char unambiguous code
    const rawCode = generateRandomCode(10);
    const codeHash = hashInvitationCode(rawCode);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const careNetwork = await prisma.careNetwork.findUnique({
      where: { profileId: req.profile!.id }
    });

    if (!careNetwork) {
      return sendError(res, 404, 'NETWORK_NOT_FOUND', 'Care network not found.');
    }

    const invitation = await prisma.$transaction(async (tx) => {
      const inv = await tx.invitation.create({
        data: {
          careNetworkId: careNetwork.id,
          role,
          relationshipLabel,
          codeHash,
          permissionPreset: permissionPreset ?? undefined,
          expiresAt,
          createdById: req.user!.id
        }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'INVITATION_CREATED',
          entityType: 'Invitation',
          entityId: inv.id,
          details: { role, relationshipLabel, expiresAt },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return inv;
    });

    return res.status(201).json({
      code: rawCode,
      invitation: {
        id: invitation.id,
        role: invitation.role,
        relationshipLabel: invitation.relationshipLabel,
        expiresAt: invitation.expiresAt
      },
      message: 'Invitation code generated. Share this code directly with the recipient. CareBuddy does not send SMS or email.'
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * DELETE /api/profiles/:profileId/invitations/:invitationId
 * Revokes an existing invitation. Owner-only.
 */
router.delete('/invitations/:invitationId', requireAuth, resolveProfileMembership, requireOwner, async (req: Request, res: Response) => {
  try {
    const { invitationId } = req.params;

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId }
    });

    if (!invitation) {
      return sendError(res, 404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED', revokedAt: new Date() }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'INVITATION_REVOKED',
          entityType: 'Invitation',
          entityId: invitationId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });
    });

    return res.json({ success: true, message: 'Invitation revoked.' });
  } catch (error) {
    console.error('Revoke invitation error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * PATCH /api/profiles/:profileId/care-network/:memberId
 * Updates member role, relationship, or permissions. Owner-only.
 */
router.patch('/care-network/:memberId', requireAuth, resolveProfileMembership, requireOwner, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const parseResult = updateMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { relationshipLabel, permissions } = parseResult.data;

    const member = await prisma.careNetworkMember.findUnique({
      where: { id: memberId }
    });

    if (!member) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Care network member not found.');
    }

    // Protect against demoting or revoking self-owner
    if (member.userId === req.user!.id && member.role === 'OWNER') {
      return sendError(res, 400, 'CANNOT_DEMOTE_OWNER', 'Owner cannot remove their own permissions.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedMember = await tx.careNetworkMember.update({
        where: { id: memberId },
        data: {
          relationshipLabel: relationshipLabel !== undefined ? relationshipLabel : member.relationshipLabel,
          viewMedications: permissions?.viewMedications !== undefined ? permissions.viewMedications : member.viewMedications,
          viewAdherence: permissions?.viewAdherence !== undefined ? permissions.viewAdherence : member.viewAdherence,
          viewAppointments: permissions?.viewAppointments !== undefined ? permissions.viewAppointments : member.viewAppointments,
          viewActivity: permissions?.viewActivity !== undefined ? permissions.viewActivity : member.viewActivity,
          recordDoses: permissions?.recordDoses !== undefined ? permissions.recordDoses : member.recordDoses,
          addNotes: permissions?.addNotes !== undefined ? permissions.addNotes : member.addNotes,
          manageMedications: permissions?.manageMedications !== undefined ? permissions.manageMedications : member.manageMedications,
          manageAppointments: permissions?.manageAppointments !== undefined ? permissions.manageAppointments : member.manageAppointments,
          actOnBehalf: permissions?.actOnBehalf !== undefined ? permissions.actOnBehalf : member.actOnBehalf
        }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'PERMISSIONS_CHANGED',
          entityType: 'CareNetworkMember',
          entityId: memberId,
          details: { updatedPermissions: permissions, relationshipLabel },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return updatedMember;
    });

    return res.json({ member: updated });
  } catch (error) {
    console.error('Update member permissions error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * DELETE /api/profiles/:profileId/care-network/:memberId
 * Revokes member access immediately. Owner-only.
 */
router.delete('/care-network/:memberId', requireAuth, resolveProfileMembership, requireOwner, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;

    const member = await prisma.careNetworkMember.findUnique({
      where: { id: memberId }
    });

    if (!member) {
      return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Care network member not found.');
    }

    if (member.userId === req.user!.id && member.role === 'OWNER') {
      return sendError(res, 400, 'CANNOT_REVOKE_OWNER', 'Owner cannot revoke their own access.');
    }

    await prisma.$transaction(async (tx) => {
      // Immediate revocation by updating status to REVOKED
      await tx.careNetworkMember.update({
        where: { id: memberId },
        data: { status: 'REVOKED' }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'ACCESS_REVOKED',
          entityType: 'CareNetworkMember',
          entityId: memberId,
          details: { revokedUserId: member.userId, revokedRole: member.role },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });
    });

    return res.json({ success: true, message: 'Member access revoked immediately.' });
  } catch (error) {
    console.error('Revoke member access error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * GET /api/profiles/:profileId/audit
 * Returns immutable audit log for this profile. Owner-only.
 */
router.get('/audit', requireAuth, resolveProfileMembership, requireOwner, async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { profileId: req.profile!.id },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    return res.json({ auditLogs: logs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

export default router;
