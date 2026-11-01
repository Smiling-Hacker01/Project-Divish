const mockStore = new Map<string, string>();
const mockApi = {
  epochEnvelopes: jest.fn(async () => ({ envelopes: [] })),
  epochRecipients: jest.fn(),
  createEpoch: jest.fn(async () => ({ epoch: { version: 1 } })),
  epochDistributionStatus: jest.fn(),
  submitEpochEnvelope: jest.fn(),
};

jest.mock('expo-crypto', () => ({
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
import { generateRSAKeyPair } from './encryption';
import {
  clearEpochSession,
  decryptV2Text,
  encryptV2Text,
} from './chatEpochs';

describe('v2 epoch message lifecycle', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    clearEpochSession();
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
});
