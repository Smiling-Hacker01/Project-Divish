-- AlterTable
ALTER TABLE "chat_devices" ADD COLUMN IF NOT EXISTS "fcm_token" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_for_recipient" BOOLEAN NOT NULL DEFAULT false;
