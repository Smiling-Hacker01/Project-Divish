import * as SecureStore from 'expo-secure-store';
import { generateRSAKeyPair } from './encryption';
import { chatApi } from '@/api';

/**
 * Manages the user's RSA keypair lifecycle: load from SecureStore, generate-and-register
 * on first run, expose accessors. Keypair generation is heavy (3–8s) so we cache the
 * result in memory after first read.
 *
 * SecureStore stores blobs in the iOS Keychain / Android Keystore, which is the right
 * place for a private signing/decryption key: the OS protects against extraction even
 * by a malicious app on the same device.
 *
 * Keypair epoch:
 *   We persist a `keypairCreatedAt` ISO timestamp alongside the keys. This is the
 *   "this device first held this private key" marker. Any chat message authored
 *   BEFORE this timestamp was encrypted under a *different* public key (because
 *   the partner cached the previous pubkey at the time of encryption), so its
 *   wrapped AES key can't be unwrapped with the current private key — those
 *   messages are permanently unrecoverable on this device. The chat UI uses
 *   this timestamp to distinguish "we expected this to fail because keys were
 *   rotated" from "this is an actual bug" and render appropriately.
 *
 *   On reinstall: SecureStore is wiped, so PRIV_KEY/PUB_KEY/KEYPAIR_CREATED_AT
 *   are all gone. We generate a fresh keypair and stamp a fresh timestamp.
 *   Historical messages from before the reinstall fall on the "from previous
 *   device" side of this divide.
 */

const PRIV_KEY = 'secretspace.rsaPrivateKey';
const PUB_KEY = 'secretspace.rsaPublicKey';
const KEYPAIR_CREATED_AT = 'secretspace.rsaKeypairCreatedAt';

let cached: { publicKey: string; privateKey: string } | null = null;
let cachedCreatedAt: string | null = null;
let inflight: Promise<{ publicKey: string; privateKey: string }> | null = null;

/**
 * Returns the user's keypair, generating a new one and registering it with the backend
 * the first time it's called. Concurrent callers receive the same in-flight promise so
 * we never run keygen twice.
 *
 * Set `registerOnGenerate` to false in flows where you don't want to hit the backend
 * (e.g. unit tests).
 */
export const getOrCreateKeyPair = async (
  registerOnGenerate = true
): Promise<{ publicKey: string; privateKey: string }> => {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const [storedPriv, storedPub, storedCreatedAt] = await Promise.all([
      SecureStore.getItemAsync(PRIV_KEY),
      SecureStore.getItemAsync(PUB_KEY),
      SecureStore.getItemAsync(KEYPAIR_CREATED_AT),
    ]);

    if (storedPriv && storedPub) {
      cached = { privateKey: storedPriv, publicKey: storedPub };
      cachedCreatedAt = storedCreatedAt ?? null;
      // Backfill the epoch for users who upgraded from a build without this
      // field. We stamp "now" — slightly inaccurate (the real birth date was
      // earlier) but it's the safest default: messages from BEFORE this
      // stamp are correctly treated as potentially-undecryptable, while any
      // post-stamp decrypt failure is correctly flagged as a real bug.
      if (!cachedCreatedAt) {
        cachedCreatedAt = new Date().toISOString();
        await SecureStore.setItemAsync(KEYPAIR_CREATED_AT, cachedCreatedAt).catch(() => undefined);
      }
      return cached;
    }

    const generated = await generateRSAKeyPair();
    const createdAt = new Date().toISOString();
    // Persist BEFORE registering — if the network call fails, we still have the keys
    // locally and can retry registration later (we ensure this in the chat init flow).
    await Promise.all([
      SecureStore.setItemAsync(PRIV_KEY, generated.privateKey),
      SecureStore.setItemAsync(PUB_KEY, generated.publicKey),
      SecureStore.setItemAsync(KEYPAIR_CREATED_AT, createdAt),
    ]);
    cached = generated;
    cachedCreatedAt = createdAt;

    if (registerOnGenerate) {
      try {
        await chatApi.setPublicKey(generated.publicKey);
      } catch (err) {
        // Non-fatal — chat init will re-attempt registration on next focus. Without the
        // server-side pub key, the partner can't encrypt to us, so this is the only path
        // where outgoing messages flow but incoming arrive unencryptable until retry.
        console.warn('[Crypto] Initial pub key registration failed', err);
      }
    }
    return cached;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
};

/**
 * Returns the timestamp at which the currently-active keypair was first held on
 * this device. Used by the chat screen to distinguish "could-never-decrypt"
 * legacy messages from real decryption bugs. Returns null only on the very
 * first call before any keypair has been loaded into memory.
 */
export const getKeypairCreatedAt = async (): Promise<string | null> => {
  if (cachedCreatedAt) return cachedCreatedAt;
  cachedCreatedAt = await SecureStore.getItemAsync(KEYPAIR_CREATED_AT).catch(() => null);
  return cachedCreatedAt;
};

/**
 * Ensure the backend has our current public key. Cheap and idempotent — safe to call on
 * every chat-screen focus, app foreground, or after a network reconnect.
 */
export const ensurePublicKeyRegistered = async (): Promise<void> => {
  const { publicKey } = await getOrCreateKeyPair(false);
  try {
    await chatApi.setPublicKey(publicKey);
  } catch (err) {
    console.warn('[Crypto] Pub key re-registration failed', err);
  }
};

/**
 * Clear the keypair from local storage. Call on logout so the next account that signs
 * in on this device gets fresh keys, not the previous user's identity.
 */
export const clearKeyPair = async (): Promise<void> => {
  cached = null;
  cachedCreatedAt = null;
  await Promise.all([
    SecureStore.deleteItemAsync(PRIV_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(PUB_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(KEYPAIR_CREATED_AT).catch(() => undefined),
  ]);
};
