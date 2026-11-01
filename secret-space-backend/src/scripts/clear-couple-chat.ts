/**
 * Utility script to safely clear chat history and conversation epochs for a specific couple
 * identified by user email.
 *
 * Usage:
 *   npx ts-node src/scripts/clear-couple-chat.ts <user-email> [--include-epochs]
 *
 * Example:
 *   npx ts-node src/scripts/clear-couple-chat.ts kushwahavishal311@gmail.com
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const includeEpochs = process.argv.includes('--include-epochs');

  if (!email) {
    console.error('❌ Error: Please provide an email address.');
    console.error('   Usage: npx ts-node src/scripts/clear-couple-chat.ts <email> [--include-epochs]');
    process.exit(1);
  }

  console.log(`🔍 Searching for couple associated with user: ${email}...`);

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      coupleAsA: {
        include: {
          userA: { select: { id: true, name: true, email: true } },
          userB: { select: { id: true, name: true, email: true } },
        },
      },
      coupleAsB: {
        include: {
          userA: { select: { id: true, name: true, email: true } },
          userB: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!user) {
    console.error(`❌ No user found with email: ${email}`);
    process.exit(1);
  }

  const couple = user.coupleAsA || user.coupleAsB;
  if (!couple) {
    console.error(`❌ User ${email} (ID: ${user.id}) is not part of any couple.`);
    process.exit(1);
  }

  console.log(`✅ Found Couple Space:`);
  console.log(`   - Couple ID: ${couple.id}`);
  console.log(`   - Partner 1: ${couple.userA?.name ?? 'N/A'} (${couple.userA?.email ?? 'N/A'})`);
  console.log(`   - Partner 2: ${couple.userB?.name ?? 'N/A'} (${couple.userB?.email ?? 'N/A'})`);
  console.log(`   - Status:    ${couple.status}`);

  // Count existing messages
  const messageCount = await prisma.message.count({
    where: { coupleId: couple.id },
  });

  console.log(`\n💬 Total messages found for this couple: ${messageCount}`);

  if (messageCount === 0) {
    console.log('✨ No messages to delete.');
  } else {
    const deleted = await prisma.message.deleteMany({
      where: { coupleId: couple.id },
    });
    console.log(`🗑️  Successfully deleted ${deleted.count} message(s) for couple ${couple.id}.`);
  }

  if (includeEpochs || process.argv.includes('--full-reset')) {
    // 1. Delete recovery envelopes
    const recoveryDeleted = await prisma.recoveryConversationEnvelope.deleteMany({
      where: { coupleId: couple.id },
    }).catch(() => ({ count: 0 }));
    if (recoveryDeleted.count > 0) {
      console.log(`🛡️  Deleted ${recoveryDeleted.count} recovery conversation envelope(s).`);
    }

    // 2. Delete key epochs (cascades to conversation_device_envelopes)
    const epochsDeleted = await prisma.conversationKeyEpoch.deleteMany({
      where: { coupleId: couple.id },
    });
    console.log(`🔑 Reset ${epochsDeleted.count} conversation key epoch(s) and envelopes.`);

    // 3. Clean up registered devices for both partners so fresh installs register clean
    const userIds = [couple.userAId, couple.userBId].filter(Boolean) as string[];
    const devicesDeleted = await prisma.device.deleteMany({
      where: { userId: { in: userIds } },
    });
    console.log(`📱 Cleared ${devicesDeleted.count} stale registered device(s) for both partners.`);

    // 4. Clear legacy public keys on User table
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { publicKey: null },
    });
    console.log(`🔐 Reset user public keys.`);
  }

  console.log('\n🎉 Finished successfully!');
}

main()
  .catch((err) => {
    console.error('❌ Operation failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
