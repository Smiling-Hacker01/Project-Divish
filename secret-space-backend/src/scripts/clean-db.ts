/**
 * Development-only database reset utility.
 *
 * Wipes every row from every app table (users, couples, and everything that
 * cascades from them) and clears app-scoped Redis keys. Optionally seeds two
 * demo users + a paired couple so you can immediately log in to a clean test
 * environment.
 *
 * Hard-gated against accidental production execution — bails immediately if
 * NODE_ENV === 'production' OR if the DATABASE_URL host looks like a managed
 * provider (Neon, Railway, Render). The --force flag intentionally does *not*
 * override these checks; you'd have to edit this file to bypass them.
 *
 * Usage (from secret-space-backend/):
 *   npm run db:clean           # wipe + confirm prompt
 *   npm run db:clean -- --yes  # wipe without prompt (CI, scripted)
 *   npm run db:clean -- --seed # wipe + insert two demo users
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import readline from 'readline';
import Redis from 'ioredis';

const prisma = new PrismaClient();

const PRODUCTION_HOST_PATTERNS = [
  /neon\.tech/i,
  /rlwy\.net/i,
  /railway\.app/i,
  /render\.com/i,
  /amazonaws\.com/i,
  /digitalocean\.com/i,
];

function refuseInProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Refusing to run: NODE_ENV is "production".');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL ?? '';
  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(url)) {
      console.error(
        `❌ Refusing to run: DATABASE_URL points at a managed host matching ${pattern}.\n` +
          '   This script is for local development only. To wipe a managed DB, do it through that provider\'s dashboard.'
      );
      process.exit(1);
    }
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} (type "yes" to continue): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function wipeDatabase(): Promise<{ users: number; couples: number }> {
  // Snapshot counts before so we report what was actually removed.
  const [usersBefore, couplesBefore] = await Promise.all([
    prisma.user.count(),
    prisma.couple.count(),
  ]);

  // TRUNCATE CASCADE on `users` + `couples` is enough to clear every app table
  // because every other table cascades from one of those two via its FK chain
  // (couple-scoped: messages, diary_entries with reactions, moods, coupons,
  // love_reasons; user-scoped: face_descriptors, vault_files).
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users", "couples" CASCADE;`);

  return { users: usersBefore, couples: couplesBefore };
}

async function wipeRedis(): Promise<number> {
  const url = process.env.REDIS_URL;
  if (!url) return 0;

  const redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  try {
    await redis.connect();
    // Only delete keys we know we own. We never run FLUSHDB because the Redis
    // instance may be shared with other dev tools (BullMQ, sessions for an
    // adjacent project, etc.).
    const patterns = ['refresh:*', 'vault:*', 'lovebot:sent:*', 'pwchange:*', 'otp:*'];
    let totalDeleted = 0;
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    }
    return totalDeleted;
  } catch (err: any) {
    console.warn(`⚠️  Redis cleanup skipped: ${err.message}`);
    return 0;
  } finally {
    redis.disconnect();
  }
}

async function seedDemo(): Promise<void> {
  // Two demo users + a paired active couple. Convenient for end-to-end test
  // flows where you don't want to re-do face enrollment every wipe. Faces and
  // public keys remain empty — the app will re-enroll/regen on first use, same
  // as a real signup.
  console.log('🌱 Seeding demo data...');
  const passwordHash = await bcrypt.hash('demo1234', 12);
  const [userA, userB] = await Promise.all([
    prisma.user.create({
      data: { name: 'Demo A', email: 'a@demo.local', passwordHash },
    }),
    prisma.user.create({
      data: { name: 'Demo B', email: 'b@demo.local', passwordHash },
    }),
  ]);

  await prisma.couple.create({
    data: {
      userAId: userA.id,
      userBId: userB.id,
      coupleCode: 'DEMO12',
      status: 'active',
      anniversaryDate: new Date('2024-01-01'),
    },
  });

  console.log('   Users:');
  console.log('     a@demo.local / demo1234  (creator)');
  console.log('     b@demo.local / demo1234  (joiner)');
  console.log('   Couple code: DEMO12 (already paired)');
}

async function main() {
  refuseInProduction();

  const args = new Set(process.argv.slice(2));
  const seed = args.has('--seed');
  const skipPrompt = args.has('--yes') || args.has('-y');

  const dbUrl = process.env.DATABASE_URL ?? '<unset>';
  // Mask the password before printing the URL so terminal scrollback doesn't leak it.
  const masked = dbUrl.replace(/:[^:@/]+@/, ':***@');
  console.log('🧹 Database reset utility');
  console.log(`   Target: ${masked}`);
  console.log(`   Mode:   ${seed ? 'wipe + seed demo data' : 'wipe only'}`);
  console.log('');

  if (!skipPrompt) {
    const ok = await confirm('⚠️  This permanently deletes ALL rows in users and couples (cascading).');
    if (!ok) {
      console.log('   Cancelled.');
      process.exit(0);
    }
  }

  try {
    const { users, couples } = await wipeDatabase();
    console.log(`✅ DB wiped — removed ${users} user(s) and ${couples} couple(s) (everything cascades from these).`);

    const redisKeys = await wipeRedis();
    if (redisKeys > 0) {
      console.log(`✅ Redis: cleared ${redisKeys} app-scoped key(s).`);
    }

    if (seed) {
      await seedDemo();
    }

    console.log('');
    console.log('🎉 Done. You can register with any email now.');
  } catch (err: any) {
    console.error('❌ Reset failed:', err.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
