-- AlterTable
ALTER TABLE "couples" DROP COLUMN "lovebot_mode",
DROP COLUMN "lovebot_time",
ADD COLUMN     "couple_photo" TEXT,
ADD COLUMN     "user_a_lovebot_mode" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "user_a_lovebot_time" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "user_b_access_granted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "user_b_lovebot_mode" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "user_b_lovebot_time" TEXT NOT NULL DEFAULT '09:00';

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "fulfilled_at" TIMESTAMP(3),
ADD COLUMN     "redeemed_at" TIMESTAMP(3),
ADD COLUMN     "review_rating" INTEGER,
ADD COLUMN     "review_text" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "diary_reactions" ADD COLUMN     "emoji" TEXT,
ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "love_reasons" ADD COLUMN     "author_id" TEXT NOT NULL,
ADD COLUMN     "delivered_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "diary_reactions" ADD CONSTRAINT "diary_reactions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "diary_reactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "love_reasons" ADD CONSTRAINT "love_reasons_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
