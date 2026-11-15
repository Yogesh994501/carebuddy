import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { IANAZone } from 'luxon';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requireOwner } from '../middleware/profile';
import { sendError } from '../utils/errors';

const router = Router();

const createProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  preferredName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.string().optional(),
  allergies: z.string().optional(),
  emergencyNotes: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata').refine(
    (tz) => IANAZone.isValidSpecifier(tz),
    { message: 'Invalid IANA timezone identifier' }
  ),
  ownerMode: z.enum(['DIRECT', 'ASSISTED']).default('DIRECT'),
  reminderLeadMinutes: z.number().int().min(5).max(60).default(15),
  overdueGraceMinutes: z.number().int().min(15).max(180).default(60),
  snoozeDurationMinutes: z.number().int().min(5).max(30).default(10),
  maxSnoozeCount: z.number().int().min(1).max(5).default(3),
  // For assisted profiles: explicit attestation required
  attestationConfirmed: z.boolean().optional()
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  preferredName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.string().optional(),
  allergies: z.string().optional(),
  emergencyNotes: z.string().optional(),
  timezone: z.string().optional().refine(
    (tz) => !tz || IANAZone.isValidSpecifier(tz),
    { message: 'Invalid IANA timezone identifier' }
  ),
  reminderLeadMinutes: z.number().int().min(5).max(60).optional(),
  overdueGraceMinutes: z.number().int().min(15).max(180).optional(),
  snoozeDurationMinutes: z.number().int().min(5).max(30).optional(),
  maxSnoozeCount: z.number().int().min(1).max(5).optional(),
  aiConsent: z.boolean().optional()
});

/**
 * POST /api/profiles
 * Creates a healthcare profile and associates caller as OWNER (or Primary Delegate if ASSISTED)
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = createProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const data = parseResult.data;

    if (data.ownerMode === 'ASSISTED' && !data.attestationConfirmed) {
      return sendError(
        res,
        400,
        'ATTESTATION_REQUIRED',
        'Creating an assisted profile requires attesting that you are authorized to manage care on behalf of the individual.'
      );
    }

    const isAssisted = data.ownerMode === 'ASSISTED';

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create ElderlyProfile
      const profile = await tx.elderlyProfile.create({
        data: {
          name: data.name,
          preferredName: data.preferredName,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          bloodGroup: data.bloodGroup,
          allergies: data.allergies,
          emergencyNotes: data.emergencyNotes,
          timezone: data.timezone,
          ownerMode: data.ownerMode,
          reminderLeadMinutes: data.reminderLeadMinutes,
          overdueGraceMinutes: data.overdueGraceMinutes,
          snoozeDurationMinutes: data.snoozeDurationMinutes,
          maxSnoozeCount: data.maxSnoozeCount,
          ownerUserId: isAssisted ? null : req.user!.id
        }
      });

      // 2. Create CareNetwork
      const network = await tx.careNetwork.create({
        data: {
          profileId: profile.id
        }
      });

      // 3. Create initial membership as OWNER
      const membership = await tx.careNetworkMember.create({
        data: {
          careNetworkId: network.id,
          userId: req.user!.id,
          role: 'OWNER',
          status: 'ACTIVE',
          isPrimaryDelegate: isAssisted,
          relationshipLabel: isAssisted ? 'Primary Delegate' : 'Self',
          // Owner has all permissions
          viewMedications: true,
          viewAdherence: true,
          viewAppointments: true,
          viewActivity: true,
          recordDoses: true,
          addNotes: true,
          manageMedications: true,
          manageAppointments: true,
          actOnBehalf: isAssisted
        }
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          profileId: profile.id,
          userId: req.user!.id,
          action: 'PROFILE_CREATED',
          entityType: 'ElderlyProfile',
          entityId: profile.id,
          details: {
            ownerMode: data.ownerMode,
            isPrimaryDelegate: isAssisted,
            attestation: isAssisted ? 'User attested authorization for assisted profile creation' : null
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return { profile, network, membership };
    });

    return res.status(201).json({
      profile: result.profile,
      role: result.membership.role,
      isPrimaryDelegate: result.membership.isPrimaryDelegate
    });
  } catch (error) {
    console.error('Create profile error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * GET /api/profiles
 * Lists all profiles where the authenticated user is an active member
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.careNetworkMember.findMany({
      where: {
        userId: req.user!.id,
        status: 'ACTIVE'
      },
      include: {
        careNetwork: {
          include: {
            profile: true
          }
        }
      }
    });

    const profiles = memberships.map((m) => ({
      profile: m.careNetwork.profile,
      membership: {
        role: m.role,
        isPrimaryDelegate: m.isPrimaryDelegate,
        relationshipLabel: m.relationshipLabel,
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
        }
      }
    }));

    return res.json({ profiles });
  } catch (error) {
    console.error('List profiles error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * GET /api/profiles/:profileId
 * Fetches profile details through membership resolution
 */
router.get('/:profileId', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
  return res.json({
    profile: req.profile,
    membership: {
      role: req.membership!.role,
      isPrimaryDelegate: req.membership!.isPrimaryDelegate,
      relationshipLabel: req.membership!.relationshipLabel,
      permissions: {
        viewMedications: req.membership!.viewMedications,
        viewAdherence: req.membership!.viewAdherence,
        viewAppointments: req.membership!.viewAppointments,
        viewActivity: req.membership!.viewActivity,
        recordDoses: req.membership!.recordDoses,
        addNotes: req.membership!.addNotes,
        manageMedications: req.membership!.manageMedications,
        manageAppointments: req.membership!.manageAppointments,
        actOnBehalf: req.membership!.actOnBehalf
      }
    }
  });
});

/**
 * PATCH /api/profiles/:profileId
 * Updates profile details. Timezone, reminder settings, and AI consent are OWNER-ONLY.
 */
router.patch('/:profileId', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
  try {
    const parseResult = updateProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const updates = parseResult.data;

    // Check for owner-only fields
    const ownerOnlyFields = [
      'timezone',
      'reminderLeadMinutes',
      'overdueGraceMinutes',
      'snoozeDurationMinutes',
      'maxSnoozeCount',
      'aiConsent'
    ] as const;

    const hasOwnerFields = ownerOnlyFields.some((f) => updates[f] !== undefined);
    if (hasOwnerFields && !req.isOwnerOrPrimaryDelegate) {
      return sendError(
        res,
        403,
        'OWNER_PERMISSION_REQUIRED',
        'Only the profile owner or primary delegate can modify timezone, reminder settings, or AI consent.'
      );
    }

    // Apply updates
    const updatedProfile = await prisma.$transaction(async (tx) => {
      const profile = await tx.elderlyProfile.update({
        where: { id: req.profile!.id },
        data: {
          name: updates.name,
          preferredName: updates.preferredName,
          dateOfBirth: updates.dateOfBirth ? new Date(updates.dateOfBirth) : undefined,
          bloodGroup: updates.bloodGroup,
          allergies: updates.allergies,
          emergencyNotes: updates.emergencyNotes,
          timezone: updates.timezone,
          reminderLeadMinutes: updates.reminderLeadMinutes,
          overdueGraceMinutes: updates.overdueGraceMinutes,
          snoozeDurationMinutes: updates.snoozeDurationMinutes,
          maxSnoozeCount: updates.maxSnoozeCount,
          aiConsent: updates.aiConsent
        }
      });

      await tx.auditLog.create({
        data: {
          profileId: profile.id,
          userId: req.user!.id,
          action: 'PROFILE_UPDATED',
          entityType: 'ElderlyProfile',
          entityId: profile.id,
          details: updates,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return profile;
    });

    return res.json({ profile: updatedProfile });
  } catch (error) {
    console.error('Update profile error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

export default router;
