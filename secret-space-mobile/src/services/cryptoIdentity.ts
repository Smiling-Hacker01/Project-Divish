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
 */

const PRIV_KEY = 'secretspace.rsaPrivateKey';
const PUB_KEY = 'secretspace.rsaPublicKey';

let cached: { publicKey: string; privateKey: string } | null = null;
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
    const [storedPriv, storedPub] = await Promise.all([
      SecureStore.getItemAsync(PRIV_KEY),
      SecureStore.getItemAsync(PUB_KEY),
    ]);

    if (storedPriv && storedPub) {
      cached = { privateKey: storedPriv, publicKey: storedPub };
      return cached;
    }

    const generated = await generateRSAKeyPair();
    // Persist BEFORE registering — if the network call fails, we still have the keys
    // locally and can retry registration later (we ensure this in the chat init flow).
    await Promise.all([
      SecureStore.setItemAsync(PRIV_KEY, generated.privateKey),
      SecureStore.setItemAsync(PUB_KEY, generated.publicKey),
    ]);
    cached = generated;

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
  await Promise.all([
    SecureStore.deleteItemAsync(PRIV_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(PUB_KEY).catch(() => undefined),
  ]);
};
