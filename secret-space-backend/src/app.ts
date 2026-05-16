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
import chatRoutes from './routes/chat.routes';
import { verifyJWT } from './middlewares/auth';
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
app.use('/api/chat', chatRoutes);

// ── Push Notification Diagnostic ──────────────────────────────────────────────
// Auth-gated diagnostic that targets the *caller's* device. Returns Firebase config
// status and (if the caller has an fcmToken registered) attempts to send a test push.
// No bulk user listing — strictly self-targeted to avoid leaking tokens.
app.get('/api/debug/push-test', verifyJWT, async (req, res) => {
  const admin = await import('./config/firebase');
  const prisma = (await import('./config/prisma')).default;

  const diag: any = {
    firebaseInitialized: admin.default.apps.length > 0,
    envVars: {
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    },
  };

  const me = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, fcmToken: true },
  });
  diag.hasFcmToken = !!me?.fcmToken;

  if (!admin.default.apps.length) {
    diag.testSendResult = { skipped: true, reason: 'Firebase not initialized on the server' };
  } else if (!me?.fcmToken) {
    diag.testSendResult = { skipped: true, reason: 'No FCM token registered for this account' };
  } else {
    try {
      const result = await admin.default.messaging().send({
        token: me.fcmToken,
        notification: { title: '🧪 Test Push', body: 'Push notifications are working!' },
        data: { type: 'debug' },
        android: { priority: 'high' },
      });
      diag.testSendResult = { success: true, messageId: result };
    } catch (err: any) {
      diag.testSendResult = { success: false, error: err.message, code: err.code };
    }
  }

  res.json(diag);
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

export default app;