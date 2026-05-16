-- Per-user avatar URL. Each user can only update their own row via PUT /api/settings/avatar.

ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
