-- Idempotency tokens for the retry queues on diary + vault, mirroring messages.client_id.
-- Postgres' default NULLS DISTINCT keeps legacy rows (clientId = NULL) free of collisions.

ALTER TABLE "diary_entries" ADD COLUMN "client_id" TEXT;
CREATE UNIQUE INDEX "diary_entries_author_id_client_id_key"
  ON "diary_entries"("author_id", "client_id");

ALTER TABLE "vault_files" ADD COLUMN "client_id" TEXT;
CREATE UNIQUE INDEX "vault_files_owner_id_client_id_key"
  ON "vault_files"("owner_id", "client_id");
CREATE INDEX "vault_files_owner_id_created_at_idx"
  ON "vault_files"("owner_id", "created_at" DESC);
