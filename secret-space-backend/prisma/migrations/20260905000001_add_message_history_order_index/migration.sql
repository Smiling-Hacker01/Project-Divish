-- Supports couple-scoped cursor pagination with deterministic timestamp/ID ordering.
CREATE INDEX "messages_couple_id_created_at_id_idx"
  ON "messages"("couple_id", "created_at", "id");
