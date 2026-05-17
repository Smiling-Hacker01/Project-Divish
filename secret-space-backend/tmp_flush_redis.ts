import redis from './src/config/redis';

(async () => {
  await redis.flushall();
  console.log('Redis flushed successfully! You can now send another push notification today.');
  process.exit(0);
})();
