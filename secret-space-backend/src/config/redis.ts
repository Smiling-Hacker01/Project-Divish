import Redis from 'ioredis';
import logger from './logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('[Redis] Connected'));
redis.on('error', (err) => logger.error({ err: err.message }, '[Redis] Connection error'));

export default redis;