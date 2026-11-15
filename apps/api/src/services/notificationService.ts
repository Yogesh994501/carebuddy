import { NotificationType } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface NotificationPayload {
  recipientId: string;
  profileId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  occurrenceKey?: string;
}

export interface NotificationChannel {
  name: string;
  send(payload: NotificationPayload): Promise<boolean>;
}

/**
 * InAppChannel - Standard In-App notification delivery
 * Respects user preferences and ensures strict idempotency.
 * Email and SMS are out of scope (Section 1 & 7).
 */
export class InAppChannel implements NotificationChannel {
  name = 'IN_APP';

  async send(payload: NotificationPayload): Promise<boolean> {
    // 1. Check user notification preferences
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_profileId_type: {
          userId: payload.recipientId,
          profileId: payload.profileId,
          type: payload.type
        }
      }
    });

    if (pref && !pref.enabled) {
      // User opted out of this notification type
      return false;
    }

    // 2. Deterministic idempotency key: type:profileId:recipientId:entityId:occurrenceKey
    const occurrence = payload.occurrenceKey || 'default';
    const entity = payload.entityId || 'none';
    const idempotencyKey = `${payload.type}:${payload.profileId}:${payload.recipientId}:${entity}:${occurrence}`;

    try {
      await prisma.notification.create({
        data: {
          profileId: payload.profileId,
          recipientId: payload.recipientId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          entityId: payload.entityId,
          idempotencyKey
        }
      });
      return true;
    } catch (err: any) {
      // Unique constraint violation (P2002 in Prisma) -> already created, return gracefully
      if (err.code === 'P2002') {
        return false;
      }
      throw err;
    }
  }
}

// Default in-app channel singleton
const inAppChannel = new InAppChannel();

export async function sendNotification(
  payload: NotificationPayload,
  channel: NotificationChannel = inAppChannel
): Promise<boolean> {
  return channel.send(payload);
}

/**
 * Fetch notifications for an authenticated user with unread count
 */
export async function getNotificationsForUser(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
) {
  const { unreadOnly = false, limit = 50, offset = 0 } = options;

  const whereClause: any = {
    recipientId: userId
  };

  if (unreadOnly) {
    whereClause.readAt = null;
  }

  const [notifications, unreadCount, totalCount] = await Promise.all([
    prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            preferredName: true
          }
        }
      }
    }),
    prisma.notification.count({
      where: {
        recipientId: userId,
        readAt: null
      }
    }),
    prisma.notification.count({
      where: {
        recipientId: userId
      }
    })
  ]);

  return {
    notifications,
    unreadCount,
    totalCount
  };
}

/**
 * Mark a single notification as read (owned by caller)
 */
export async function markNotificationAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  });

  if (!notification || notification.recipientId !== userId) {
    return null;
  }

  if (notification.readAt) {
    return notification;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() }
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string, profileId?: string) {
  const whereClause: any = {
    recipientId: userId,
    readAt: null
  };

  if (profileId) {
    whereClause.profileId = profileId;
  }

  const result = await prisma.notification.updateMany({
    where: whereClause,
    data: { readAt: new Date() }
  });

  return { updatedCount: result.count };
}

/**
 * Get notification preferences for user on a profile
 */
export async function getNotificationPreferences(userId: string, profileId: string) {
  const allTypes: NotificationType[] = [
    'DOSE_UPCOMING',
    'DOSE_MISSED',
    'APPOINTMENT_UPCOMING',
    'APPOINTMENT_CHANGED',
    'MEDICATION_CHANGED',
    'INVITATION_ACCEPTED',
    'ACCESS_REVOKED',
    'PERMISSIONS_CHANGED',
    'CAREGIVER_ACTIVITY'
  ];

  const existingPrefs = await prisma.notificationPreference.findMany({
    where: {
      userId,
      profileId
    }
  });

  const prefMap = new Map<NotificationType, boolean>(
    existingPrefs.map((p) => [p.type, p.enabled])
  );

  return allTypes.map((type) => ({
    type,
    enabled: prefMap.has(type) ? prefMap.get(type)! : true
  }));
}

/**
 * Update a notification preference for user on a profile
 */
export async function updateNotificationPreference(
  userId: string,
  profileId: string,
  type: NotificationType,
  enabled: boolean
) {
  return prisma.notificationPreference.upsert({
    where: {
      userId_profileId_type: {
        userId,
        profileId,
        type
      }
    },
    update: {
      enabled
    },
    create: {
      userId,
      profileId,
      type,
      enabled
    }
  });
}
