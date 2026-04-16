import admin from '../config/firebase';
import prisma from '../config/prisma';
import logger from '../config/logger';

/**
 * Send a push notification to a user via FCM.
 * Silently no-ops if the user has no FCM token or Firebase is not configured.
 */
export const sendPush = async (userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> => {
  try {
    if (!admin.apps.length) {
      logger.debug({ userId }, '[Notification] Firebase not configured — skipping');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (!user?.fcmToken) {
      logger.debug({ userId }, '[Notification] User has no FCM token — skipping');
      return;
    }

    await admin.messaging().send({
      token: user.fcmToken,
      notification: { title, body },
      data,
      android: { priority: 'high' },
    });

    logger.info({ userId }, '[Notification] Push sent');
  } catch (err: any) {
    // If the token is invalid, clear it
    if (err?.code === 'messaging/invalid-registration-token' || err?.code === 'messaging/registration-token-not-registered') {
      await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } });
      logger.warn({ userId }, '[Notification] Cleared invalid FCM token');
    } else {
      logger.error({ err: err.message, userId }, '[Notification] Push failed');
    }
  }
};
