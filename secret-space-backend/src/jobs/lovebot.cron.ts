import cron from 'node-cron';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { sendPush } from '../services/notification.service';

/**
 * LoveBot Cron Job
 * Runs every minute. For each active couple with lovebotMode !== "off":
 * - Checks if the current time (HH:MM UTC) matches lovebotTime
 * - Uses Redis dedup key to prevent double-sends per day
 * - Picks an unused love reason, marks it used, sends push notification
 * - Respects lovebotTarget: "both" or "partner_only"
 */
export const startLoveBotCron = (): void => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const todayKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

      // Find active couples
      const couples = await prisma.couple.findMany({
        where: {
          status: 'active',
          userBId: { not: null },
          OR: [
            { userALoveBotMode: { not: 'off' }, userALoveBotTime: currentTime },
            { userBAccessGranted: true, userBLoveBotMode: { not: 'off' }, userBLoveBotTime: currentTime }
          ]
        },
        select: {
          id: true,
          userAId: true,
          userBId: true,
          userALoveBotMode: true,
          userALoveBotTime: true,
          userBAccessGranted: true,
          userBLoveBotMode: true,
          userBLoveBotTime: true,
        },
      });

      for (const couple of couples) {
        // --- Process User A -> User B ---
        if (couple.userALoveBotMode !== 'off' && couple.userALoveBotTime === currentTime) {
          await processUserCronRule(
            couple.id,
            couple.userAId,
            couple.userBId!, 
            couple.userALoveBotMode, 
            todayKey
          );
        }

        // --- Process User B -> User A ---
        if (couple.userBAccessGranted && couple.userBLoveBotMode !== 'off' && couple.userBLoveBotTime === currentTime) {
          await processUserCronRule(
            couple.id,
            couple.userBId!,
            couple.userAId, 
            couple.userBLoveBotMode, 
            todayKey
          );
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, '[LoveBot] Cron error');
    }
  });

  logger.info('[LoveBot] Cron job started (every minute)');
};

async function processUserCronRule(coupleId: string, senderId: string, recipientId: string, mode: string, dateKey: string) {
  const dedupKey = `lovebot:sent:${coupleId}:${senderId}:${dateKey}`;

  const alreadySent = await redis.get(dedupKey);
  if (alreadySent) return;

  if (mode === 'surprise' && Math.random() > 0.5) {
    await redis.set(dedupKey, 'skipped', 'EX', 86400);
    return;
  }

  const reason = await prisma.loveReason.findFirst({
    where: { coupleId, forUserId: recipientId, used: false },
    orderBy: { createdAt: 'asc' }
  });

  if (reason) {
    await prisma.loveReason.update({
      where: { id: reason.id },
      data: { used: true, deliveredAt: new Date() },
    });

    const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });

    await sendPush(
      recipientId,
      '💌 Love Note Delivered',
      `You have a new message from ${sender?.name} 💌`,
      { url: '/home' }
    );

    logger.info({ coupleId, recipientId, reasonId: reason.id }, '[LoveBot] Reason sent');
  }

  await redis.set(dedupKey, 'sent', 'EX', 86400);
}

