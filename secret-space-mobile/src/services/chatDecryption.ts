import { ChatMessage } from '@/types/api';
import { decryptAESKeyWithRSA, decryptTextAES } from './encryption';
import { decryptV2Text } from './chatEpochs';

export type DecryptionResult = '__LOCKED__' | '__DECRYPTION_FAILED__' | string;

type CacheEntry = {
  fingerprint: string;
  result: DecryptionResult;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<DecryptionResult>>();

const cacheKey = (userId: string, messageId: string) => `${userId}:${messageId}`;

const fingerprint = (message: ChatMessage, keypairCreatedAt: string | null): string =>
  [
    message.content ?? '',
    message.senderAesKey ?? '',
    message.recipientAesKey ?? '',
    message.encryptionVersion ?? '',
    message.keyEpochVersion ?? '',
    message.wrappedContentKey ?? '',
    keypairCreatedAt ?? '',
  ].join('|');

export const getCachedDecryption = (
  userId: string,
  message: ChatMessage,
  keypairCreatedAt: string | null
): DecryptionResult | undefined => {
  const entry = cache.get(cacheKey(userId, message.id));
  const currentFingerprint = fingerprint(message, keypairCreatedAt);
  return entry?.fingerprint === currentFingerprint ? entry.result : undefined;
};

export const decryptOnce = (
  userId: string,
  message: ChatMessage,
  privateKey: string,
  keypairCreatedAt: string | null
): Promise<DecryptionResult> => {
  const key = cacheKey(userId, message.id);
  const currentFingerprint = fingerprint(message, keypairCreatedAt);
  const cached = cache.get(key);
  if (cached?.fingerprint === currentFingerprint) return Promise.resolve(cached.result);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<DecryptionResult> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (message.encryptionVersion === '2') {
          const result = await decryptV2Text(userId, message);
          cache.set(key, { fingerprint: currentFingerprint, result });
          return result;
        }
        const wrappedKey = message.senderId === userId
          ? message.senderAesKey
          : message.recipientAesKey;
        if (!wrappedKey) {
          const result = message.content ?? '';
          cache.set(key, { fingerprint: currentFingerprint, result });
          return result;
        }
        const aesKey = await decryptAESKeyWithRSA(wrappedKey, privateKey);
        const result = await decryptTextAES(message.content!, aesKey);
        cache.set(key, { fingerprint: currentFingerprint, result });
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }

    // A failed v2 operation is never relabeled as a previous-device message. Legacy
    // rows retain the old compatibility state until explicit migration metadata exists.
    const result: DecryptionResult = message.encryptionVersion === '2'
      ? '__DECRYPTION_FAILED__'
      : '__LOCKED__';
    cache.set(key, { fingerprint: currentFingerprint, result });
    if (message.encryptionVersion === '2') {
      console.error('[Chat] Decryption failed after retries', {
        messageId: message.id,
        error: lastError instanceof Error ? lastError.message : 'unknown error',
      });
    }
    return result;
  })();

  inFlight.set(key, job);
  void job.then(() => {
    if (inFlight.get(key) === job) inFlight.delete(key);
  }, () => {
    if (inFlight.get(key) === job) inFlight.delete(key);
  });
  return job;
};

export const invalidateDecryption = (userId: string, messageId: string): void => {
  cache.delete(cacheKey(userId, messageId));
};

export const clearDecryptionSession = (userId?: string): void => {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key);
};
