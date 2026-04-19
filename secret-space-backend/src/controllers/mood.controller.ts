import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { upsertMoodSchema } from '../utils/validators';
import { sendPush } from '../services/notification.service';

// ── POST /api/mood ─────────────────────────────────────────────────────────────
export const upsertMood = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = upsertMoodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { mood } = parsed.data;
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    await prisma.mood.upsert({
      where: { coupleId_userId: { coupleId, userId } },
      create: { coupleId, userId, mood },
      update: { mood },
    });

    const partnerId = req.partnerId;
    if (partnerId) {
      let message = 'Your partner just updated their mood.';
      switch (mood) {
        case '😊':
          message = 'Your partner is feeling happy today 😄 Share the joy with them!';
          break;
        case '❤️':
          message = 'Your partner is feeling loved 💖 Keep the love going!';
          break;
        case '⚡':
          message = 'Your partner is feeling productive ⚡ Rooting for them!';
          break;
        case '💭':
          message = 'Your partner is missing you 💭 Give them a call or send some love.';
          break;
        case '😔':
          message = 'Your partner might need you right now 💙 Check in and make them smile.';
          break;
        case '🌧':
          message = 'Your partner is feeling low 🌧 They could really use your love today.';
          break;
        case '😣':
          message = 'Your partner is feeling stressed 😞 Maybe they need some comfort.';
          break;
        case '😠':
          message = 'Your partner seems a bit upset ⚡ Maybe it’s a good time to talk.';
          break;
        case '😤':
          message = 'Your partner is feeling a bit grumpy 😤 Maybe send them a sweet surprise.';
          break;
      }
      
      await sendPush(
        partnerId,
        'Mood Update',
        message,
        { url: '/home' }
      ).catch(e => console.error('[Push Error]', e));
    }

    res.json({ success: true, mood });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/mood ──────────────────────────────────────────────────────────────
export const getCoupleMoods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const moods = await prisma.mood.findMany({
      where: { coupleId },
      select: { userId: true, mood: true, updatedAt: true },
    });

    const myMood = moods.find((m) => m.userId === userId);
    const partnerMood = moods.find((m) => m.userId !== userId);

    res.json({
      myMood: myMood?.mood || null,
      partnerMood: partnerMood?.mood || null,
    });
  } catch (err) {
    next(err);
  }
};
