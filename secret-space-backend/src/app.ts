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

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

export default app;