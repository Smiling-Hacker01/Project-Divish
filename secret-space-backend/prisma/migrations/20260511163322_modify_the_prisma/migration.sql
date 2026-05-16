-- AlterTable
ALTER TABLE "diary_entries" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "edited_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "edited_at" TIMESTAMP(3);
