-- Adds client-supplied idempotency token to messages. The (sender_id, client_id) unique
-- index relies on Postgres' default NULLS DISTINCT behavior, so legacy rows where
-- client_id is NULL coexist freely while a sender's retried send with the same client_id
-- collapses to a single row.

ALTER TABLE "messages" ADD COLUMN "client_id" TEXT;

CREATE UNIQUE INDEX "messages_sender_id_client_id_key"
  ON "messages"("sender_id", "client_id");
