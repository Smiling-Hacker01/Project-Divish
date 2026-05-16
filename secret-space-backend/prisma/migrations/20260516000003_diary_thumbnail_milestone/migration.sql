-- Diary additions: video thumbnail (Cloudinary-derived poster URL), milestone flag for
-- the existing "Mark as milestone" UI toggle, and an index for the paginated feed query.

ALTER TABLE "diary_entries" ADD COLUMN "thumbnail_url" TEXT;
ALTER TABLE "diary_entries" ADD COLUMN "milestone" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "diary_entries_couple_id_created_at_idx"
  ON "diary_entries"("couple_id", "created_at" DESC);
