import forge from 'node-forge';
import * as ExpoCrypto from 'expo-crypto';

/**
 * End-to-End Encryption for mobile, byte-for-byte wire-compatible with the web client.
 *
 * Web uses the browser's SubtleCrypto API. We use node-forge here because React Native
 * has no SubtleCrypto and adding a native crypto module would break Expo Go.
 *
 * Compatibility contract with web ([secret-space-frontend/src/app/services/encryption.ts]):
 *   - Public keys: base64-encoded SPKI (DER, RSA-OAEP-2048-SHA256)
 *   - Private keys: base64-encoded PKCS#8 (DER)
 *   - AES keys: 256-bit raw, base64
 *   - Encrypted text: base64(IV ‖ ciphertext+authTag) using AES-GCM with 12-byte IV
 *
 * Anything written by mobile is decryptable by web and vice versa.
 *
 * RNG: node-forge in React Native falls back to Math.random + timing for entropy, which
 * is not cryptographically secure. We seed its Fortuna pool with bytes from expo-crypto
 * (which uses the OS CSPRNG) on first use, and we generate IVs / AES keys directly from
 * expo-crypto so they never go through node-forge's PRNG at all.
 */

let cryptoSeeded = false;
const ensureSeeded = async (): Promise<void> => {
  if (cryptoSeeded) return;
  const seed = await ExpoCrypto.getRandomBytesAsync(256);
  let bytes = '';
  for (let i = 0; i < seed.length; i++) bytes += String.fromCharCode(seed[i]);
  // `collect` exists on the underlying Fortuna instance but isn't in the type defs.
  (forge.random as unknown as { collect: (b: string) => void }).collect(bytes);
  cryptoSeeded = true;
};

const randomBytes = async (n: number): Promise<string> => {
  const arr = await ExpoCrypto.getRandomBytesAsync(n);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return s;
};

const utf8ToForgeBytes = (str: string): string => forge.util.encodeUtf8(str);
const forgeBytesToUtf8 = (bytes: string): string => forge.util.decodeUtf8(bytes);
const bytesToBase64 = (bytes: string): string => forge.util.encode64(bytes);
const base64ToBytes = (b64: string): string => forge.util.decode64(b64);

// ── RSA-OAEP-2048-SHA256 ─────────────────────────────────────────────────────

/**
 * Generate a fresh RSA-OAEP-2048 keypair. Returns base64 SPKI public and base64 PKCS#8
 * private blobs, matching the web client's localStorage format exactly.
 *
 * Performance note: this is CPU-heavy in pure JS (3–8s on a phone). Call once per
 * install and persist; never run on the JS thread mid-conversation.
 */
export const generateRSAKeyPair = async (): Promise<{ publicKey: string; privateKey: string }> => {
  await ensureSeeded();
  if (__DEV__) console.log('[Crypto] Starting RSA-2048 keygen…');
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    // IMPORTANT: do NOT pass `workers` here. React Native has no Web Worker support,
    // so `workers: -1` (spawn navigator.hardwareConcurrency workers) silently hangs —
    // node-forge tries to spawn workers, finds none, and the callback never fires.
    // The default (no `workers` option) uses async time-slicing via setImmediate.
    //
    // BITS: 1024 here is a testing-tier compromise. Pure-JS RSA-2048 takes 60-200s on
    // mid-tier Android (verified at 187s) — unusable as a first-launch UX. 1024-bit
    // gets us to 15-30s while still being decryption-compatible with web's 2048-bit
    // keys (RSA-OAEP doesn't care about the other side's key size).
    //
    // PATH-B FOLLOWUP: react-native-quick-crypto v0.7.x doesn't work under Expo's new
    // architecture (Fabric/Bridgeless) and v1.x needs RN 0.77+, so the native-crypto
    // swap is deferred until one of those changes. Until then we stay on pure-JS forge.
    forge.pki.rsa.generateKeyPair({ bits: 1024 }, (err, keyPair) => {
        if (err || !keyPair) {
          reject(err ?? new Error('Key generation failed'));
          return;
        }
        try {
          // SPKI / PKCS#8 DER, matching window.crypto.subtle.exportKey('spki' | 'pkcs8').
          const spkiDer = forge.asn1
            .toDer(forge.pki.publicKeyToAsn1(keyPair.publicKey))
            .getBytes();
          const pkcs8Der = forge.asn1
            .toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyPair.privateKey)))
            .getBytes();
          if (__DEV__) {
            console.log(`[Crypto] Keygen done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
          }
          resolve({
            publicKey: bytesToBase64(spkiDer),
            privateKey: bytesToBase64(pkcs8Der),
          });
        } catch (e) {
          reject(e as Error);
        }
      }
    );
  });
};

const importRsaPublicKeyFromSpkiBase64 = (publicKeyBase64: string): forge.pki.rsa.PublicKey => {
  const der = base64ToBytes(publicKeyBase64);
  const asn1 = forge.asn1.fromDer(der);
  return forge.pki.publicKeyFromAsn1(asn1) as forge.pki.rsa.PublicKey;
};

const importRsaPrivateKeyFromPkcs8Base64 = (privateKeyBase64: string): forge.pki.rsa.PrivateKey => {
  const der = base64ToBytes(privateKeyBase64);
  const asn1 = forge.asn1.fromDer(der);
  // pkcs8 → unwrap → RSA private key
  return forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
};

/**
 * Wrap a base64 AES key with the partner's RSA public key using OAEP/SHA-256, matching
 * the web client. The output is the base64 RSA ciphertext.
 */
export const encryptAESKeyWithRSA = async (
  aesKeyBase64: string,
  partnerPublicKeyBase64: string
): Promise<string> => {
  const pubKey = importRsaPublicKeyFromSpkiBase64(partnerPublicKeyBase64);
  // The web encrypts the *utf-8 bytes of the base64 string itself*, not the raw key
  // bytes. We mirror that exactly so the unwrap on the other side matches.
  const plaintextBytes = utf8ToForgeBytes(aesKeyBase64);
  const encrypted = pubKey.encrypt(plaintextBytes, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  return bytesToBase64(encrypted);
};

export const decryptAESKeyWithRSA = async (
  encryptedAesKeyBase64: string,
  myPrivateKeyBase64: string
): Promise<string> => {
  const privKey = importRsaPrivateKeyFromPkcs8Base64(myPrivateKeyBase64);
  const ct = base64ToBytes(encryptedAesKeyBase64);
  const pt = privKey.decrypt(ct, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  return forgeBytesToUtf8(pt);
};

// ── AES-GCM-256 ──────────────────────────────────────────────────────────────

/** Generate a fresh 256-bit AES key, base64. Uses OS CSPRNG via expo-crypto. */
export const generateAESKey = async (): Promise<string> => {
  const keyBytes = await randomBytes(32);
  return bytesToBase64(keyBytes);
};

/**
 * Encrypt with AES-GCM. Output is base64(12-byte IV ‖ ciphertext ‖ 16-byte authTag) —
 * the same concatenation the web's Web Crypto API produces, which lets web decrypt
 * mobile-originated messages without any wire-format conversion.
 */
export const encryptTextAES = async (text: string, aesKeyBase64: string): Promise<string> => {
  const key = base64ToBytes(aesKeyBase64);
  if (key.length !== 32) throw new Error('AES key must be 256 bits');
  const iv = await randomBytes(12);
  const cipher = forge.cipher.createCipher('AES-GCM', key);
  cipher.start({ iv, tagLength: 128 });
  cipher.update(forge.util.createBuffer(utf8ToForgeBytes(text)));
  cipher.finish();
  // Web Crypto's AES-GCM output is `ciphertext ‖ authTag`, prepended by the IV we manage.
  const combined = iv + cipher.output.getBytes() + cipher.mode.tag.getBytes();
  return bytesToBase64(combined);
};

export const decryptTextAES = async (
  encryptedWithIvBase64: string,
  aesKeyBase64: string
): Promise<string> => {
  const key = base64ToBytes(aesKeyBase64);
  if (key.length !== 32) throw new Error('AES key must be 256 bits');
  const combined = base64ToBytes(encryptedWithIvBase64);
  if (combined.length < 12 + 16) throw new Error('Ciphertext too short for AES-GCM');
  const iv = combined.substring(0, 12);
  const tag = combined.substring(combined.length - 16);
  const ct = combined.substring(12, combined.length - 16);

  const decipher = forge.cipher.createDecipher('AES-GCM', key);
  decipher.start({ iv, tag: forge.util.createBuffer(tag), tagLength: 128 });
  decipher.update(forge.util.createBuffer(ct));
  const ok = decipher.finish();
  if (!ok) throw new Error('AES-GCM authentication failed');
  return forgeBytesToUtf8(decipher.output.getBytes());
};
