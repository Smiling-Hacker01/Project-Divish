import Redis, { type RedisOptions } from 'ioredis';
import logger from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOptions: RedisOptions = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 5_000,
  retryStrategy(times: number): number | null {
    // Keep transient retry bursts short. If Redis is misconfigured or the
    // hostname is stale, we want to fail fast and let the process continue in
    // degraded mode instead of spending the whole render cycle in reconnect
    // churn.
    if (times >= 5) return null;
    return Math.min(times * 250, 2_000);
  },
};

const redis = new Redis(redisUrl, redisOptions);

redis.on('connect', () => logger.info('[Redis] Connected'));
redis.on('error', (err: Error) => logger.error({ err: err.message }, '[Redis] Connection error'));

export default redis;
