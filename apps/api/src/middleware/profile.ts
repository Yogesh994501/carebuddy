import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { sendError } from '../utils/errors';
import { ElderlyProfile, CareNetworkMember, NetworkRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      profile?: ElderlyProfile;
      membership?: CareNetworkMember;
      isOwnerOrPrimaryDelegate?: boolean;
    }
  }
}

export type PermissionKey =
  | 'viewMedications'
  | 'viewAdherence'
  | 'viewAppointments'
  | 'viewActivity'
  | 'recordDoses'
  | 'addNotes'
  | 'manageMedications'
  | 'manageAppointments'
  | 'actOnBehalf';

/**
 * Resolves the profile through the caller's active membership row.
 * A profile ID from the client is NEVER trusted on its own.
 * Read fresh from the database on every request to ensure immediate revocation.
 * Returns 404 (not 403) if the caller is not an active member, preventing existence leakage.
 */
export async function resolveProfileMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const profileId = req.params.profileId;
    if (!profileId) {
      return sendError(res, 400, 'MISSING_PROFILE_ID', 'Profile ID parameter is required.');
    }

    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    // Look up profile and membership in one query
    const profile = await prisma.elderlyProfile.findUnique({
      where: { id: profileId },
      include: {
        careNetwork: {
          include: {
            members: {
              where: {
                userId: req.user.id,
                status: 'ACTIVE'
              }
            }
          }
        }
      }
    });

    // If profile does not exist OR user is not an active member of this profile's care network:
    // Return 404 to avoid leaking profile existence (Section 11)
    if (!profile || !profile.careNetwork || profile.careNetwork.members.length === 0) {
      return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found or access denied.');
    }

    const membership = profile.careNetwork.members[0];

    // Determine if caller has Owner powers (is OWNER or Primary Delegate)
    const isOwnerOrPrimaryDelegate =
      membership.role === 'OWNER' || membership.isPrimaryDelegate === true;

    req.profile = profile;
    req.membership = membership;
    req.isOwnerOrPrimaryDelegate = isOwnerOrPrimaryDelegate;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Ensures caller is the Owner or Primary Delegate of the resolved profile.
 * Used for owner-only operations: invitations, member removal, permission editing, timezone/reminder settings.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.isOwnerOrPrimaryDelegate) {
    return sendError(
      res,
      403,
      'OWNER_PERMISSION_REQUIRED',
      'This operation is restricted to the profile owner or primary delegate.'
    );
  }
  next();
}

/**
 * Ensures caller has the specific permission flag or is the profile owner.
 */
export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership) {
      return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found or access denied.');
    }

    // The owner has everything on their own profile
    if (req.isOwnerOrPrimaryDelegate) {
      return next();
    }

    // Check individual permission flag
    if (!req.membership[permission]) {
      return sendError(
        res,
        403,
        'FORBIDDEN',
        `You do not have the required permission (${permission}) to perform this action.`
      );
    }

    next();
  };
}
