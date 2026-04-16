import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Wiping all application data...');

  try {
    // A PostgreSQL TRUNCATE CASCADE will automatically delete all dependent records
    // in all related tables safely and efficiently.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users", "couples" CASCADE;`);
    console.log('✅ Database wiped successfully. You can now register with the same email!');
  } catch (error) {
    console.error('❌ Failed to wipe database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
