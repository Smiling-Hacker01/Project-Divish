import { Buffer } from 'buffer';
import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPair,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'react-native-quick-crypto';

/**
 * End-to-End Encryption for mobile, byte-for-byte wire-compatible with the web client.
 *
 * Backed by react-native-quick-crypto — a JSI-bound C++ implementation of Node's
 * `crypto` module. RSA-2048 keygen runs in ~80–150ms instead of the 15–30s we paid
 * with pure-JS node-forge.
 *
 * Compatibility contract with web ([secret-space-frontend/src/app/services/encryption.ts]):
 *   - Public keys: base64-encoded SPKI (DER, RSA-OAEP-2048-SHA256)
 *   - Private keys: base64-encoded PKCS#8 (DER)
 *   - AES keys: 256-bit raw, base64
 *   - Encrypted text: base64(IV ‖ ciphertext+authTag) using AES-GCM with 12-byte IV
 *
 * Existing 1024-bit keys created under the old forge-based code remain decryptable
 * here: RSA-OAEP doesn't care about modulus size, the PKCS#8 DER parser handles both.
 * Only NEW keypairs are issued at 2048-bit.
 */

// ── RSA-OAEP-2048-SHA256 ─────────────────────────────────────────────────────

/**
 * Generate a fresh RSA-OAEP-2048 keypair. Returns base64 SPKI public and base64 PKCS#8
 * private blobs, matching the web client's localStorage format exactly.
 *
 * Uses the async callback form so keygen runs on a native thread and doesn't block
 * JS (the sync variant would freeze the UI for ~100ms on cold devices).
 */
export const generateRSAKeyPair = async (): Promise<{ publicKey: string; privateKey: string }> => {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    generateKeyPair(
      'rsa',
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
          return;
        }
        if (__DEV__) {
          console.log(`[Crypto] RSA-2048 keygen done in ${Date.now() - startedAt}ms`);
        }
        resolve({
          publicKey: Buffer.from(publicKey as Uint8Array).toString('base64'),
          privateKey: Buffer.from(privateKey as Uint8Array).toString('base64'),
        });
      }
    );
  });
};

/**
 * Wrap a base64 AES key with the partner's RSA public key using OAEP/SHA-256, matching
 * the web client. The output is the base64 RSA ciphertext.
 *
 * Wire quirk we mirror from web: we encrypt the *utf-8 bytes of the base64 AES string*
 * (not the raw key bytes), because that's what `window.crypto.subtle.encrypt(...)`
 * with a TextEncoder-wrapped base64 input produces on the web side.
 */
export const encryptAESKeyWithRSA = async (
  aesKeyBase64: string,
  partnerPublicKeyBase64: string
): Promise<string> => {
  // quick-crypto auto-detects DER+SPKI when a non-PEM Buffer is passed as `key`, so we
  // don't need explicit `format`/`type` options — and the option type doesn't accept
  // them anyway.
  const pubKeyDer = Buffer.from(partnerPublicKeyBase64, 'base64');
  const plaintext = Buffer.from(aesKeyBase64, 'utf-8');
  const encrypted = publicEncrypt(
    {
      key: pubKeyDer,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    plaintext
  );
  return Buffer.from(encrypted).toString('base64');
};

export const decryptAESKeyWithRSA = async (
  encryptedAesKeyBase64: string,
  myPrivateKeyBase64: string
): Promise<string> => {
  // Same DER+PKCS8 auto-detection rule applies on the private side.
  const privKeyDer = Buffer.from(myPrivateKeyBase64, 'base64');
  const ciphertext = Buffer.from(encryptedAesKeyBase64, 'base64');
  const decrypted = privateDecrypt(
    {
      key: privKeyDer,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    ciphertext
  );
  return Buffer.from(decrypted).toString('utf-8');
};

// ── AES-GCM-256 ──────────────────────────────────────────────────────────────

/** Generate a fresh 256-bit AES key, base64. Uses the OS CSPRNG via quick-crypto. */
export const generateAESKey = async (): Promise<string> => {
  const key = randomBytes(32);
  return Buffer.from(key).toString('base64');
};

/**
 * Encrypt with AES-GCM. Output is base64(12-byte IV ‖ ciphertext ‖ 16-byte authTag) —
 * the same concatenation the web's Web Crypto API produces, which lets web decrypt
 * mobile-originated messages without any wire-format conversion.
 */
export const encryptTextAES = async (text: string, aesKeyBase64: string): Promise<string> => {
  const key = Buffer.from(aesKeyBase64, 'base64');
  if (key.length !== 32) throw new Error('AES key must be 256 bits');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(text, 'utf-8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([Buffer.from(iv), ciphertext, Buffer.from(tag)]);
  return combined.toString('base64');
};

export const decryptTextAES = async (
  encryptedWithIvBase64: string,
  aesKeyBase64: string
): Promise<string> => {
  const key = Buffer.from(aesKeyBase64, 'base64');
  if (key.length !== 32) throw new Error('AES key must be 256 bits');
  const combined = Buffer.from(encryptedWithIvBase64, 'base64');
  if (combined.length < 12 + 16) throw new Error('Ciphertext too short for AES-GCM');
  // Wrap each slice in Buffer.from() to land on the canonical `Buffer` type —
  // `subarray` returns the typed `Buffer<ArrayBuffer>` subtype which TS treats as
  // incompatible with the deciphers's parameter signatures.
  const iv = Buffer.from(combined.subarray(0, 12));
  const tag = Buffer.from(combined.subarray(combined.length - 16));
  const ciphertext = Buffer.from(combined.subarray(12, combined.length - 16));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  // `tag` is a real Buffer at runtime, but the library's setAuthTag signature was
  // typed against an older non-generic @types/node Buffer that no longer matches the
  // generic Buffer<ArrayBufferLike> we're holding. The cast is purely a TS bridge.
  decipher.setAuthTag(tag as any);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
};
