const mockStore = new Map<string, string>();
const mockApi = {
  epochEnvelopes: jest.fn(async () => ({ envelopes: [] })),
  epochRecipients: jest.fn(),
  createEpoch: jest.fn(async (_dId?: string, _payload?: any) => ({ epoch: { version: 1 } as any })),
  epochDistributionStatus: jest.fn(),
  submitEpochEnvelope: jest.fn(),
  registerDevice: jest.fn(async () => ({ ok: true })),
  bootstrapDevice: jest.fn(async () => ({ device: { status: 'active' } })),
  setPublicKey: jest.fn(async () => ({ message: 'ok' })),
};

jest.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
  getRandomBytesAsync: async (size: number) => {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) bytes[i] = (i * 47 + 23) & 0xff;
    return bytes;
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));
jest.mock('./deviceIdentity', () => ({
  getOrCreateDeviceId: jest.fn(async () => '11111111-1111-4111-8111-111111111111'),
  getDeviceKeyVersion: jest.fn(() => 1),
}));
jest.mock('@/api', () => ({ chatApi: mockApi }));

import { chatApi } from '@/api';
import {
  decryptAESKeyWithRSA,
  generateRSAKeyPair,
} from './encryption';
import {
  clearEpochSession,
  decryptV2Text,
  distributeMissingEpochEnvelopes,
  encryptV2Text,
} from './chatEpochs';
import {
  clearDecryptionSession,
  decryptOnce,
  getCachedDecryption,
} from './chatDecryption';

describe('v2 epoch message lifecycle and reliability', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    clearEpochSession();
    clearDecryptionSession();
  });

  it('generates the epoch locally and round-trips a v2 message without plaintext key upload', async () => {
    const deviceKeys = await generateRSAKeyPair();
    mockStore.set('secretspace.rsaPrivateKey', deviceKeys.privateKey);
    mockStore.set('secretspace.rsaPublicKey', deviceKeys.publicKey);
    mockApi.epochRecipients.mockResolvedValue({
      recipients: [{ id: '11111111-1111-4111-8111-111111111111', userId: 'user-a', publicKey: deviceKeys.publicKey, keyVersion: 1 }],
    });

    const encrypted = await encryptV2Text('user-a', 'A1 to A2 secure message');
    expect(encrypted.encryptionVersion).toBe('2');
    expect(encrypted.wrappedContentKey).not.toContain('A1 to A2 secure message');
    expect((chatApi.createEpoch as jest.Mock).mock.calls[0][0]).toBe('11111111-1111-4111-8111-111111111111');
    expect((chatApi.createEpoch as jest.Mock).mock.calls[0][1].envelopes[0].wrappedEpochKey).toBeTruthy();

    const message = {
      id: 'message-1',
      senderId: 'user-a',
      content: encrypted.content,
      sender: { id: 'user-a', name: 'A1' },
      coupleId: 'couple-1',
      mediaUrl: null,
      mediaType: null,
      senderAesKey: null,
      recipientAesKey: null,
      encryptionVersion: encrypted.encryptionVersion,
      keyEpochVersion: encrypted.keyEpochVersion,
      wrappedContentKey: encrypted.wrappedContentKey,
      status: 'sent' as const,
      reactions: {},
      deletedForEveryone: false,
      deletedForSender: false,
      createdAt: new Date().toISOString(),
    };
    await expect(decryptV2Text('user-a', message)).resolves.toBe('A1 to A2 secure message');
    await expect(decryptV2Text('user-a', { ...message, content: `${message.content!.slice(0, 24)}A${message.content!.slice(25)}` })).rejects.toThrow();
  }, 30000);

  it('distributes missing epoch envelopes to a newly added partner device and allows history decryption', async () => {
    // 1. Device A creates an epoch and sends a message
    const deviceAKeys = await generateRSAKeyPair();
    mockStore.set('secretspace.rsaPrivateKey', deviceAKeys.privateKey);
    mockStore.set('secretspace.rsaPublicKey', deviceAKeys.publicKey);
    mockApi.epochRecipients.mockResolvedValue({
      recipients: [{ id: '11111111-1111-4111-8111-111111111111', userId: 'user-a', publicKey: deviceAKeys.publicKey, keyVersion: 1 }],
    });

    const encrypted = await encryptV2Text('user-a', 'Past secret history');

    // 2. Partner B registers a brand new device B2
    const deviceB2Keys = await generateRSAKeyPair();
    mockApi.epochDistributionStatus.mockResolvedValue({
      epochs: [
        {
          version: 1,
          status: 'active',
          missingDevices: [
            { id: '22222222-2222-4222-8222-222222222222', userId: 'user-b', publicKey: deviceB2Keys.publicKey, keyVersion: 1 },
          ],
        },
      ],
    });

    // Device A runs distributeMissingEpochEnvelopes
    await distributeMissingEpochEnvelopes('user-a');

    expect(chatApi.submitEpochEnvelope).toHaveBeenCalledTimes(1);
    const [submittingDeviceId, epochVer, payload] = (chatApi.submitEpochEnvelope as jest.Mock).mock.calls[0];
    expect(submittingDeviceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(epochVer).toBe(1);
    expect(payload.deviceId).toBe('22222222-2222-4222-8222-222222222222');
    expect(payload.keyVersion).toBe(1);

    // 3. Verify Device B2 can unwrap the distributed epoch key and decrypt the past message!
    const unwrappedEpochKeyByB2 = await decryptAESKeyWithRSA(payload.wrappedEpochKey, deviceB2Keys.privateKey);
    expect(unwrappedEpochKeyByB2).toBeTruthy();
  }, 30000);

  it('recovers dynamically when a message initially fails decryption before its epoch arrives', async () => {
    const deviceKeys = await generateRSAKeyPair();
    mockStore.set('secretspace.rsaPrivateKey', deviceKeys.privateKey);
    mockStore.set('secretspace.rsaPublicKey', deviceKeys.publicKey);

    // Device starts with NO epoch envelopes
    mockApi.epochEnvelopes.mockResolvedValue({ envelopes: [] });

    const message = {
      id: 'msg-locked-1',
      senderId: 'user-partner',
      content: 'enc-content',
      sender: { id: 'user-partner', name: 'Partner' },
      coupleId: 'couple-1',
      mediaUrl: null,
      mediaType: null,
      senderAesKey: null,
      recipientAesKey: null,
      encryptionVersion: '2',
      keyEpochVersion: 1,
      wrappedContentKey: 'enc-wrapped-key',
      status: 'sent' as const,
      reactions: {},
      deletedForEveryone: false,
      deletedForSender: false,
      createdAt: new Date().toISOString(),
    };

    // First attempt: should fail fast with __DECRYPTION_FAILED__ because epoch 1 is not yet distributed
    const firstResult = await decryptOnce('user-me', message, deviceKeys.privateKey, null);
    expect(firstResult).toBe('__DECRYPTION_FAILED__');
    expect(getCachedDecryption('user-me', message, null)).toBe('__DECRYPTION_FAILED__');

    // Partner now generates an epoch, encrypts a message, and delivers the envelope to user-me
    mockApi.epochRecipients.mockResolvedValue({
      recipients: [{ id: '11111111-1111-4111-8111-111111111111', userId: 'user-me', publicKey: deviceKeys.publicKey, keyVersion: 1 }],
    });
    const encrypted = await encryptV2Text('user-me', 'Now revealed message');
    const validMessage = {
      ...message,
      content: encrypted.content,
      keyEpochVersion: encrypted.keyEpochVersion,
      wrappedContentKey: encrypted.wrappedContentKey,
    };

    // When envelopes update, the cache invalidates failed decryptions
    const secondResult = await decryptOnce('user-me', validMessage, deviceKeys.privateKey, null);
    expect(secondResult).toBe('Now revealed message');
    expect(getCachedDecryption('user-me', validMessage, null)).toBe('Now revealed message');
  }, 30000);

  it('recovers automatically if epoch recipients are initially empty during fast send', async () => {
    const deviceKeys = await generateRSAKeyPair();
    mockStore.set('secretspace.rsaPrivateKey', deviceKeys.privateKey);
    mockStore.set('secretspace.rsaPublicKey', deviceKeys.publicKey);

    mockApi.registerDevice = jest.fn(async () => ({ ok: true }));
    mockApi.bootstrapDevice = jest.fn(async () => ({ device: { status: 'active' } }));
    mockApi.setPublicKey = jest.fn(async () => ({ message: 'ok' }));

    // First call to recipients is empty (device registration was in-flight)
    // Second call returns the active recipient
    mockApi.epochRecipients
      .mockResolvedValueOnce({ recipients: [] })
      .mockResolvedValue({
        recipients: [{ id: '11111111-1111-4111-8111-111111111111', userId: 'user-a', publicKey: deviceKeys.publicKey, keyVersion: 1 }],
      });

    const encrypted = await encryptV2Text('user-a', 'Resilient message');
    expect(encrypted.encryptionVersion).toBe('2');
    expect(chatApi.createEpoch).toHaveBeenCalled();
  }, 30000);

  it('handles the case where BOTH devices fresh install without crashing or breaking new chats', async () => {
    // Phase 1: An old message existed from Epoch 1 before the uninstall
    const oldEpoch1Message = {
      id: 'old-epoch-1-msg',
      senderId: 'user-a',
      content: 'enc-epoch-1-ciphertext',
      sender: { id: 'user-a', name: 'Alice' },
      coupleId: 'couple-1',
      mediaUrl: null,
      mediaType: null,
      senderAesKey: null,
      recipientAesKey: null,
      encryptionVersion: '2',
      keyEpochVersion: 1,
      wrappedContentKey: 'wrapped-content-key-1',
      status: 'sent' as const,
      reactions: {},
      deletedForEveryone: false,
      deletedForSender: false,
      createdAt: new Date().toISOString(),
    };

    // Phase 2: BOTH devices uninstall (local storage, SecureStore, and private keys wiped)
    mockStore.clear();
    clearEpochSession();
    clearDecryptionSession();

    // Phase 3: Both devices fresh install -> generate brand new device IDs and keypairs A2 & B2
    const devA2Keys = await generateRSAKeyPair();
    const devB2Keys = await generateRSAKeyPair();
    const devA2Id = '11111111-2222-3333-4444-555555555555';
    const devB2Id = '66666666-7777-8888-9999-000000000000';

    mockStore.set('secretspace.deviceId', devA2Id);
    mockStore.set('secretspace.rsaPrivateKey', devA2Keys.privateKey);
    mockStore.set('secretspace.rsaPublicKey', devA2Keys.publicKey);

    // Old Epoch 1 envelopes were encrypted for destroyed keys A1 and B1,
    // so new device A2 receives NO usable envelopes for Epoch 1.
    mockApi.epochEnvelopes.mockResolvedValue({ envelopes: [] });

    // When A2 views old Epoch 1 messages, it safely marks them __DECRYPTION_FAILED__
    // without throwing unhandled rejections, UI freezing, or crashing
    const oldDecryptResult = await decryptOnce('user-a', oldEpoch1Message, devA2Keys.privateKey, null);
    expect(oldDecryptResult).toBe('__DECRYPTION_FAILED__');

    // Phase 4: A2 sends a new message to B2.
    // Active recipients on the backend are now A2 and B2
    mockApi.epochRecipients.mockResolvedValue({
      recipients: [
        { id: devA2Id, userId: 'user-a', publicKey: devA2Keys.publicKey, keyVersion: 1 },
        { id: devB2Id, userId: 'user-b', publicKey: devB2Keys.publicKey, keyVersion: 1 },
      ],
    });
    mockApi.createEpoch.mockImplementation(async (_dId?: string, payload?: any) => ({
      epoch: { version: 2, envelopes: payload?.envelopes ?? [] },
    }));

    // Calling encryptV2Text detects no usable existing epoch on A2 and seamlessly creates Epoch 2!
    const newEncrypted = await encryptV2Text('user-a', 'Hello from our fresh installs!');
    expect(newEncrypted.encryptionVersion).toBe('2');
    expect(newEncrypted.keyEpochVersion).toBe(2);
    expect(mockApi.createEpoch).toHaveBeenCalled();

    // Verify B2 can unwrap the newly created Epoch 2 envelope and decrypt the new message
    const epochPayload = (mockApi.createEpoch as jest.Mock).mock.calls[0]?.[1];
    expect(epochPayload).toBeDefined();
    const b2Envelope = epochPayload.envelopes.find((e: any) => e.deviceId === devB2Id);
    expect(b2Envelope).toBeDefined();

    const unwrappedEpochKeyByB2 = await decryptAESKeyWithRSA(b2Envelope.wrappedEpochKey, devB2Keys.privateKey);
    expect(unwrappedEpochKeyByB2).toBeTruthy();
  }, 30000);
});
