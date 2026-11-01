import admin from '../config/firebase';
import prisma from '../config/prisma';
import logger from '../config/logger';

/**
 * Distinguishable outcomes from a push attempt. Callers (the LoveBot cron, the
 * chat notifier, etc.) use these to decide whether to retry / surface a
 * "notifications offline" state to the partner. We do NOT throw on the failure
 * modes — every caller wants to continue its workflow even if the push fails.
 */
export type PushResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'firebase-not-configured' | 'no-token' }
  | { status: 'invalid-token' }
  | { status: 'failed'; error: string };

/**
 * Send a push notification to a user via FCM and report the outcome.
 *
 * Why return a status (instead of staying `void` as the original
 * implementation): the LoveBot cron needs to log whether each scheduled
 * delivery actually reached the partner's device, and the only way to do that
 * without re-querying Firebase is to surface the result here. The previous
 * silent-no-op style hid all delivery failures from the cron's structured logs.
 */
export const sendPush = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<PushResult> => {
  if (!admin.apps.length) {
    logger.debug({ userId }, '[Notification] Firebase not configured — skipping');
    return { status: 'skipped', reason: 'firebase-not-configured' };
  }

  const tokenMap = new Map<string, string | null>(); // token -> deviceId (null if user-level)
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fcmToken: true,
        devices: {
          where: { status: 'active', revokedAt: null, fcmToken: { not: null } },
          select: { id: true, fcmToken: true },
        },
      },
    });

    if (user?.fcmToken) {
      tokenMap.set(user.fcmToken, null);
    }
    if (user?.devices) {
      for (const dev of user.devices) {
        if (dev.fcmToken) tokenMap.set(dev.fcmToken, dev.id);
      }
    }
  } catch (err: any) {
    logger.error({ err: err?.message, userId }, '[Notification] Token lookup failed');
    return { status: 'failed', error: err?.message ?? 'token-lookup-failed' };
  }

  if (tokenMap.size === 0) {
    logger.debug({ userId }, '[Notification] User has no FCM token — skipping');
    return { status: 'skipped', reason: 'no-token' };
  }

  let sentCount = 0;
  for (const [token, deviceId] of tokenMap.entries()) {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data,
        android: { priority: 'high' },
      });
      sentCount++;
    } catch (err: any) {
      if (
        err?.code === 'messaging/invalid-registration-token' ||
        err?.code === 'messaging/registration-token-not-registered'
      ) {
        if (deviceId) {
          await prisma.device
            .update({ where: { id: deviceId }, data: { fcmToken: null } })
            .catch(() => undefined);
        } else {
          await prisma.user
            .update({ where: { id: userId }, data: { fcmToken: null } })
            .catch(() => undefined);
        }
        logger.warn({ userId, deviceId, code: err.code }, '[Notification] Invalid FCM token — cleared');
      } else {
        logger.error({ err: err?.message, code: err?.code, userId }, '[Notification] Device push failed');
      }
    }
  }

  if (sentCount > 0) {
    logger.info({ userId, sentCount }, '[Notification] Push sent');
    return { status: 'sent' };
  }
  return { status: 'failed', error: 'all-device-pushes-failed' };
};
