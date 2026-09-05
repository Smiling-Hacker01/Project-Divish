import { ChatMessage } from '@/types/api';
import { chatApi } from '@/api';
import {
  decryptAESKeyWithRSA,
  decryptTextAES,
  encryptAESKeyWithRSA,
  encryptTextAES,
  generateAESKey,
} from './encryption';
import { getOrCreateDeviceId } from './deviceIdentity';
import { getOrCreateKeyPair } from './cryptoIdentity';

export const CHAT_ENCRYPTION_V2 = '2';

type EpochKey = { epochVersion: number; epochKey: string };
type EpochEnvelope = {
  epoch: { version: number; status: string };
  keyVersion: number;
  wrappedEpochKey: string;
};
type DistributionStatus = {
  epochs: Array<{
    version: number;
    status: string;
    missingDevices: Array<{ id: string; userId: string; publicKey: string; keyVersion: number }>;
  }>;
};

const epochKeys = new Map<string, EpochKey>();
const epochLoads = new Map<string, Promise<void>>();

const sessionKey = (userId: string, version: number) => `${userId}:${version}`;

const loadOwnEnvelopes = async (userId: string): Promise<void> => {
  const envelopes = (await chatApi.epochEnvelopes(await getOrCreateDeviceId())).envelopes as EpochEnvelope[];
  const { privateKey } = await getOrCreateKeyPair(false);
  for (const envelope of envelopes) {
    if (!Number.isInteger(envelope.epoch?.version) || !envelope.wrappedEpochKey) continue;
    try {
      const epochKey = await decryptAESKeyWithRSA(envelope.wrappedEpochKey, privateKey);
      epochKeys.set(sessionKey(userId, envelope.epoch.version), {
        epochVersion: envelope.epoch.version,
        epochKey,
      });
    } catch {
      // A malformed/tampered envelope is ignored here. The caller reports the
      // absence of a usable key instead of falling back to an unrelated key.
    }
  }
};

export const refreshEpochKeys = async (userId: string): Promise<void> => {
  const existing = epochLoads.get(userId);
  if (existing) return existing;
  const load = loadOwnEnvelopes(userId).finally(() => {
    if (epochLoads.get(userId) === load) epochLoads.delete(userId);
  });
  epochLoads.set(userId, load);
  return load;
};

export const getEpochKey = async (userId: string, version: number): Promise<string | null> => {
  const cached = epochKeys.get(sessionKey(userId, version));
  if (cached) return cached.epochKey;
  await refreshEpochKeys(userId);
  return epochKeys.get(sessionKey(userId, version))?.epochKey ?? null;
};

export const createConversationEpoch = async (userId: string): Promise<EpochKey> => {
  const deviceId = await getOrCreateDeviceId();
  const recipients = (await chatApi.epochRecipients(deviceId)).recipients as Array<{
    id: string;
    publicKey: string;
    keyVersion: number;
  }>;
  if (recipients.length === 0) throw new Error('No active devices are available for encryption');

  const epochKey = await generateAESKey();
  const envelopes = await Promise.all(recipients.map(async (recipient) => ({
    deviceId: recipient.id,
    keyVersion: recipient.keyVersion,
    wrappedEpochKey: await encryptAESKeyWithRSA(epochKey, recipient.publicKey),
  })));
  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const response = await chatApi.createEpoch(deviceId, { requestId, envelopes });
  const version = response.epoch?.version;
  if (!Number.isInteger(version)) throw new Error('Server returned an invalid epoch version');
  epochKeys.set(sessionKey(userId, version), { epochVersion: version, epochKey });
  return { epochVersion: version, epochKey };
};

export const getOrCreateConversationEpoch = async (userId: string): Promise<EpochKey> => {
  await refreshEpochKeys(userId);
  const current = [...epochKeys.values()]
    .filter((entry) => entry.epochVersion > 0 && epochKeys.get(sessionKey(userId, entry.epochVersion)) === entry)
    .sort((a, b) => b.epochVersion - a.epochVersion)[0];
  return current ?? createConversationEpoch(userId);
};

// Rewraps every epoch/device pair that is still missing. This is safe to call on
// foreground, reconnect, and chat open: the server's unique constraint makes the
// operation idempotent and an unavailable local epoch key simply remains pending.
export const distributeMissingEpochEnvelopes = async (userId: string): Promise<void> => {
  const deviceId = await getOrCreateDeviceId();
  const status = await chatApi.epochDistributionStatus(deviceId) as DistributionStatus;
  for (const epoch of status.epochs) {
    const epochKey = epochKeys.get(sessionKey(userId, epoch.version))?.epochKey;
    if (!epochKey) continue;
    for (const target of epoch.missingDevices) {
      const wrappedEpochKey = await encryptAESKeyWithRSA(epochKey, target.publicKey);
      await chatApi.submitEpochEnvelope(deviceId, epoch.version, {
        deviceId: target.id,
        keyVersion: target.keyVersion,
        wrappedEpochKey,
      });
    }
  }
};

export const encryptV2Text = async (userId: string, plaintext: string) => {
  const epoch = await getOrCreateConversationEpoch(userId);
  const contentKey = await generateAESKey();
  return {
    content: await encryptTextAES(plaintext, contentKey),
    wrappedContentKey: await encryptTextAES(contentKey, epoch.epochKey),
    encryptionVersion: CHAT_ENCRYPTION_V2,
    keyEpochVersion: epoch.epochVersion,
  };
};

export const decryptV2Text = async (userId: string, message: ChatMessage): Promise<string> => {
  if (message.encryptionVersion !== CHAT_ENCRYPTION_V2 ||
      !message.keyEpochVersion || !message.wrappedContentKey || !message.content) {
    throw new Error('Invalid v2 message envelope');
  }
  const epochKey = await getEpochKey(userId, message.keyEpochVersion);
  if (!epochKey) throw new Error('Conversation epoch key is unavailable');
  const contentKey = await decryptTextAES(message.wrappedContentKey, epochKey);
  return decryptTextAES(message.content, contentKey);
};

export const clearEpochSession = (userId?: string): void => {
  if (!userId) {
    epochKeys.clear();
    return;
  }
  for (const key of epochKeys.keys()) if (key.startsWith(`${userId}:`)) epochKeys.delete(key);
};
