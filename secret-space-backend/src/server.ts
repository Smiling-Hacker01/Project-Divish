// Force IPv4 DNS resolution for all outbound connections. Render's free tier resolves
// AAAA records for hosts like smtp.gmail.com but cannot actually route IPv6 egress, so
// without this every SMTP send (and any IPv6-resolvable third-party API) times out at
// the network layer. Setting `ipv4first` makes Node try A records before AAAA for the
// whole process — works for nodemailer, Firebase Admin, Cloudinary, anything.
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import app from './app';
import prisma from './config/prisma';
import redis from './config/redis';
import logger from './config/logger';
import './config/firebase'; // Initialize Firebase Admin SDK for push notifications
import { validateJwtConfig } from './utils/jwt';
import { startLoveBotCron } from './jobs/lovebot.cron';
import { initializeChatSockets } from './websockets/chat.gateway';

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    // ── Validate configuration ───────────────────────────────────────
    validateJwtConfig();

    // ── Verify DB connection ─────────────────────────────────────────
    await prisma.$connect();
    logger.info('[DB] PostgreSQL connected via Prisma');

    // ── Verify Redis connection ──────────────────────────────────────
    let redisReady = false;
    try {
      await redis.connect();
      await redis.ping();
      redisReady = true;
      logger.info('[Redis] Connection verified');
    } catch (err: any) {
      logger.warn({ err: err?.message }, '[Redis] Unavailable at startup; continuing in degraded mode');
    }

    // Face-api.js models are lazy-loaded on first /auth/face-* request via
    // extractDescriptor() — keeps ~150 MB of TF tensors out of resident memory until
    // we actually need them, which matters on Render's 512 MB tier.

    // ── Start LoveBot cron job ───────────────────────────────────────
    if (redisReady) {
      startLoveBotCron();
    } else {
      logger.warn('[LoveBot] Cron not started because Redis is unavailable');
    }

    // ── Start HTTP server ────────────────────────────────────────────
    const server = app.listen(PORT, () => {
      logger.info(`[Server] Running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    // ── Initialize WebSockets ─────────────────────────────────────────
    initializeChatSockets(server);

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
