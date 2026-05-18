import prisma from '../config/prisma';

/**
 * Canonical shape for the User object the mobile client expects in AuthContext.
 * Single source of truth — both /auth/login (initial hydration) and /settings/profile
 * (refresh) read through this so a refresh never silently drops fields like
 * `isCreator` or `partnerName` that the UI depends on.
 */
export const getPopulatedUser = async (userId: string) => {
  const account = await prisma.user.findUnique({ where: { id: userId } });
  if (!account) throw new Error('User not found');

  const couple = await prisma.couple.findFirst({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
  });

  const isCreator = couple?.userAId === userId;
  const partnerId = isCreator ? couple?.userBId ?? undefined : couple?.userAId;
  let partnerName: string | undefined;
  let partnerAvatar: string | null | undefined;

  if (partnerId) {
    const p = await prisma.user.findUnique({
      where: { id: partnerId },
      select: { name: true, avatarUrl: true },
    });
    if (p) {
      partnerName = p.name;
      partnerAvatar = p.avatarUrl;
    }
  }

  const hasFace = !!(await prisma.faceDescriptor.findUnique({ where: { userId } }));

  return {
    id: account.id,
    name: account.name,
    email: account.email,
    avatarUrl: account.avatarUrl,
    coupleCode: couple?.coupleCode,
    isCreator: couple ? isCreator : undefined,
    partnerId,
    partnerName,
    partnerAvatar,
    faceMFAEnabled: hasFace,
    anniversaryDate: couple?.anniversaryDate?.toISOString().split('T')[0],
    coupleStatus: couple?.status as 'active' | 'waiting' | undefined,
  };
};
