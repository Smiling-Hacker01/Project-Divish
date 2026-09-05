-- Additive multi-device key architecture. Legacy message ciphertext and key columns
-- remain intact so existing installations can continue decrypting old messages.
ALTER TABLE "messages"
  ADD COLUMN "sender_device_id" TEXT,
  ADD COLUMN "encryption_version" TEXT,
  ADD COLUMN "key_epoch_version" INTEGER,
  ADD COLUMN "wrapped_content_key" TEXT;

CREATE TABLE "chat_devices" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "chat_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_device_keys" (
  "id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "public_key" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "chat_device_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_key_epochs" (
  "id" TEXT NOT NULL,
  "couple_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retired_at" TIMESTAMP(3),
  "creation_request_id" TEXT,
  CONSTRAINT "conversation_key_epochs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_device_envelopes" (
  "id" TEXT NOT NULL,
  "epoch_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL,
  "wrapped_epoch_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_device_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recovery_key_envelopes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "encryption_version" TEXT NOT NULL,
  "kdf_algorithm" TEXT NOT NULL,
  "kdf_parameters" JSONB NOT NULL,
  "salt" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "encrypted_recovery_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_key_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recovery_conversation_envelopes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "couple_id" TEXT NOT NULL,
  "epoch_version" INTEGER NOT NULL,
  "nonce" TEXT NOT NULL,
  "encrypted_epoch_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recovery_conversation_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_device_keys_device_id_key_version_key"
  ON "chat_device_keys"("device_id", "key_version");
CREATE INDEX "chat_device_keys_device_id_created_at_idx"
  ON "chat_device_keys"("device_id", "created_at");
CREATE INDEX "chat_devices_user_id_status_idx"
  ON "chat_devices"("user_id", "status");
CREATE UNIQUE INDEX "conversation_key_epochs_couple_id_version_key"
  ON "conversation_key_epochs"("couple_id", "version");
CREATE UNIQUE INDEX "conversation_key_epochs_creation_request_id_key"
  ON "conversation_key_epochs"("creation_request_id");
CREATE INDEX "conversation_key_epochs_couple_id_status_idx"
  ON "conversation_key_epochs"("couple_id", "status");
CREATE UNIQUE INDEX "conversation_device_envelopes_epoch_id_device_id_key"
  ON "conversation_device_envelopes"("epoch_id", "device_id");
CREATE INDEX "conversation_device_envelopes_device_id_created_at_idx"
  ON "conversation_device_envelopes"("device_id", "created_at");
CREATE UNIQUE INDEX "recovery_key_envelopes_user_id_encryption_version_key"
  ON "recovery_key_envelopes"("user_id", "encryption_version");
CREATE UNIQUE INDEX "recovery_conversation_envelopes_user_id_couple_id_epoch_version_key"
  ON "recovery_conversation_envelopes"("user_id", "couple_id", "epoch_version");
CREATE INDEX "recovery_conversation_envelopes_user_id_couple_id_idx"
  ON "recovery_conversation_envelopes"("user_id", "couple_id");
CREATE INDEX "messages_sender_device_id_idx" ON "messages"("sender_device_id");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_sender_device_id_fkey"
  FOREIGN KEY ("sender_device_id") REFERENCES "chat_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_devices"
  ADD CONSTRAINT "chat_devices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_device_keys"
  ADD CONSTRAINT "chat_device_keys_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "chat_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_key_epochs"
  ADD CONSTRAINT "conversation_key_epochs_couple_id_fkey"
  FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_device_envelopes"
  ADD CONSTRAINT "conversation_device_envelopes_epoch_id_fkey"
  FOREIGN KEY ("epoch_id") REFERENCES "conversation_key_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_device_envelopes"
  ADD CONSTRAINT "conversation_device_envelopes_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "chat_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_key_envelopes"
  ADD CONSTRAINT "recovery_key_envelopes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_conversation_envelopes"
  ADD CONSTRAINT "recovery_conversation_envelopes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_conversation_envelopes"
  ADD CONSTRAINT "recovery_conversation_envelopes_couple_id_fkey"
  FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_pairing_challenges" (
  "id" TEXT NOT NULL,
  "creator_device_id" TEXT NOT NULL,
  "target_device_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_pairing_challenges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_pairing_challenges_token_hash_key"
  ON "chat_pairing_challenges"("token_hash");
CREATE INDEX "chat_pairing_challenges_target_device_id_expires_at_idx"
  ON "chat_pairing_challenges"("target_device_id", "expires_at");
CREATE INDEX "chat_pairing_challenges_creator_device_id_expires_at_idx"
  ON "chat_pairing_challenges"("creator_device_id", "expires_at");
ALTER TABLE "chat_pairing_challenges"
  ADD CONSTRAINT "chat_pairing_challenges_creator_device_id_fkey"
  FOREIGN KEY ("creator_device_id") REFERENCES "chat_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_pairing_challenges"
  ADD CONSTRAINT "chat_pairing_challenges_target_device_id_fkey"
  FOREIGN KEY ("target_device_id") REFERENCES "chat_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
