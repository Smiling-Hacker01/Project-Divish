import app from './app';
import prisma from './config/prisma';
import redis from './config/redis';
import logger from './config/logger';
import { loadModels } from './services/face.service';
import { validateJwtConfig } from './utils/jwt';
import { startLoveBotCron } from './jobs/lovebot.cron';

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    // ── Validate configuration ───────────────────────────────────────
    validateJwtConfig();

    // ── Verify DB connection ─────────────────────────────────────────
    await prisma.$connect();
    logger.info('[DB] PostgreSQL connected via Prisma');

    // ── Verify Redis connection ──────────────────────────────────────
    await redis.ping();
    logger.info('[Redis] Connection verified');

    // ── Pre-load face-api.js models ──────────────────────────────────
    await loadModels();

    // ── Start LoveBot cron job ───────────────────────────────────────
    startLoveBotCron();

    // ── Start HTTP server ────────────────────────────────────────────
    const server = app.listen(PORT, () => {
      logger.info(`[Server] Running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    // ── Graceful shutdown ────────────────────────────────────────────
    const shutdown = async (signal: string) => {
      logger.info(`[Server] ${signal} received — shutting down gracefully`);
      server.close(async () => {
        await prisma.$disconnect();
        redis.disconnect();
        logger.info('[Server] Shutdown complete');
        process.exit(0);
      });

      // Force exit after 10s if graceful shutdown stalls
      setTimeout(() => {
        logger.error('[Server] Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, '[Server] Failed to start');
    console.error("======= FATAL CRASH EXACT ERROR =======");
    console.error(err);
    console.error("=========================================");
    process.exit(1);
  }
};

start();