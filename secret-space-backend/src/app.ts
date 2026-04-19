import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import logger from './config/logger';
import authRoutes from './routes/auth.routes';
import diaryRoutes from './routes/diary.routes';
import moodRoutes from './routes/mood.routes';
import couponsRoutes from './routes/coupons.routes';
import vaultRoutes from './routes/vault.routes';
import lovebotRoutes from './routes/lovebot.routes';
import dashboardRoutes from './routes/dashboard.routes';
import settingsRoutes from './routes/settings.routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// ── Railway Proxy Config ───────────────────────────────────────────────────────
// Required for express-rate-limit to work behind Railway's load balancer
app.set('trust proxy', 1);

// ── Request logging ────────────────────────────────────────────────────────────
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => (req as any).url === '/health' } }));

// ── Security ───────────────────────────────────────────────────────────────────
logger.info({ origins: process.env.ALLOWED_ORIGINS }, '[Server] CORS Allowed Origins');
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || '*',
  credentials: true,
}));
app.use(helmet());

// ── Body parsing ───────────────────────────────────────────────────────────────
// Increase limit for base64 face images and vault uploads (~50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/diary', diaryRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/lovebot', lovebotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

// ── Push Notification Diagnostic (TEMPORARY — remove after debugging) ─────────
app.get('/api/debug/push-test', async (_req, res) => {
  const admin = await import('./config/firebase');
  const prisma = (await import('./config/prisma')).default;
  
  const diag: any = {
    firebaseInitialized: admin.default.apps.length > 0,
    firebaseAppCount: admin.default.apps.length,
    envVars: {
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
      privateKeyStart: process.env.FIREBASE_PRIVATE_KEY?.substring(0, 30) || 'EMPTY',
    },
  };

  // Find a user with an FCM token
  const usersWithTokens = await prisma.user.findMany({
    where: { fcmToken: { not: null } },
    select: { id: true, name: true, fcmToken: true },
  });

  diag.usersWithFcmTokens = usersWithTokens.map(u => ({
    id: u.id,
    name: u.name,
    tokenPrefix: u.fcmToken?.substring(0, 20) + '...',
  }));

  // Try to send a test notification to the first user with a token
  if (usersWithTokens.length > 0 && admin.default.apps.length > 0) {
    const testUser = usersWithTokens[0];
    try {
      const result = await admin.default.messaging().send({
        token: testUser.fcmToken!,
        notification: { title: '🧪 Test Push', body: 'Push notifications are working!' },
        android: { priority: 'high' },
      });
      diag.testSendResult = { success: true, messageId: result };
    } catch (err: any) {
      diag.testSendResult = { success: false, error: err.message, code: err.code };
    }
  } else {
    diag.testSendResult = {
      skipped: true,
      reason: usersWithTokens.length === 0
        ? 'No users have FCM tokens registered'
        : 'Firebase not initialized',
    };
  }

  res.json(diag);
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

export default app;