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
import adminRoutes from './routes/admin.routes';
import { verifyJWT } from './middlewares/auth';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// ── Railway Proxy Config ───────────────────────────────────────────────────────
// Required for express-rate-limit to work behind Railway's load balancer
app.set('trust proxy', 1);

// ── Disable response ETag for API routes ─────────────────────────────────────
// Every /api/* endpoint serves dynamic per-user content (dashboard, chat
// history, lovebot settings, vault list, coupons, etc.) — none of it is
// cacheable. Express's default strong-etag computation was producing
// matching etags across different content snapshots in some races, which
// triggered native HTTP-cache 304s on the mobile client and made the
// dashboard appear "stuck" on stale data (todaysReason null) even after
// a successful refresh-reason call had populated the DB. Belt + suspenders
// approach: turn off etag generation here, and the explicit Cache-Control
// middleware below tells the client not to cache regardless.
app.set('etag', false);

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

// ── No-store header on API routes ────────────────────────────────────────────
// Stop the native HTTP cache on the mobile client (OkHttp on Android,
// NSURLSession on iOS) from serving stale per-user content. With ETag
// disabled above, the only remaining caching vector is heuristic freshness
// — adding `Cache-Control: no-store` is the explicit "never cache this"
// directive that every HTTP cache layer honors. Together they guarantee
// every authenticated GET hits the server fresh, which matches how this
// app actually works (writes from any device must be visible everywhere
// within polling latency, not whenever a heuristic cache decides to
// revalidate).
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  next();
});

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
app.use('/api/admin', adminRoutes);

// ── Push Notification Diagnostic ──────────────────────────────────────────────
// Auth-gated diagnostic that targets the *caller's* device. Returns Firebase config
// status and (if the caller has an fcmToken registered) attempts to send a test push.
// Only registered outside production — prod diagnoses push via Firebase Console /
// server logs, not via a publicly reachable HTTP route.
if (process.env.NODE_ENV !== 'production') {
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
}

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

export default app;