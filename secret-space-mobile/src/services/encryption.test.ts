import {
  decryptAESKeyWithRSA,
  decryptTextAES,
  encryptAESKeyWithRSA,
  encryptTextAES,
  generateAESKey,
  generateRSAKeyPair,
} from './encryption';

let mockRngSeed = 0;
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (size: number) => {
    const bytes = new Uint8Array(size);
    mockRngSeed += 1;
    for (let i = 0; i < size; i += 1) bytes[i] = (i * 31 + 17 + mockRngSeed) & 0xff;
    return bytes;
  },
}));

describe('mobile encryption primitives', () => {
  it('wraps and unwraps a content key with RSA-OAEP', async () => {
    const keys = await generateRSAKeyPair();
    const contentKey = await generateAESKey();

    const wrapped = await encryptAESKeyWithRSA(contentKey, keys.publicKey);
    await expect(decryptAESKeyWithRSA(wrapped, keys.privateKey)).resolves.toBe(contentKey);
  }, 30000);

  it('round-trips AES-GCM ciphertext and rejects modification', async () => {
    const key = await generateAESKey();
    const ciphertext = await encryptTextAES('A1 to A2 authenticated message', key);

    await expect(decryptTextAES(ciphertext, key)).resolves.toBe('A1 to A2 authenticated message');
    const index = 24;
    const altered = `${ciphertext.slice(0, index)}${ciphertext[index] === 'A' ? 'B' : 'A'}${ciphertext.slice(index + 1)}`;
    await expect(decryptTextAES(altered, key)).rejects.toThrow();
  });

  it('uses a fresh content key and IV for each message', async () => {
    const key = await generateAESKey();
    const first = await encryptTextAES('same plaintext', key);
    const second = await encryptTextAES('same plaintext', key);

    expect(second).not.toBe(first);
    await expect(decryptTextAES(first, key)).resolves.toBe('same plaintext');
    await expect(decryptTextAES(second, key)).resolves.toBe('same plaintext');
  });
});
