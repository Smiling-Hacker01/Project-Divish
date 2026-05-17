/**
 * End-to-End Encryption (E2EE) Utility
 * Uses the native Web Crypto API for performance and security.
 */

const stringToArrayBuffer = (str: string): ArrayBuffer => {
  const uint8 = new TextEncoder().encode(str);
  return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
};

const arrayBufferToString = (buffer: ArrayBuffer): string => {
  return new TextDecoder().decode(buffer);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// ── RSA Key Management (Asymmetric) ──────────────────────────────────────────

export const generateRSAKeyPair = async (): Promise<{ publicKey: string; privateKey: string }> => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const exportedPublicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const exportedPrivateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(exportedPublicKey),
    privateKey: arrayBufferToBase64(exportedPrivateKey),
  };
};

export const encryptAESKeyWithRSA = async (aesKeyBase64: string, partnerPublicKeyBase64: string): Promise<string> => {
  const publicKeyBuffer = base64ToArrayBuffer(partnerPublicKeyBase64);
  const cryptoKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );

  const encryptedData = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    cryptoKey,
    stringToArrayBuffer(aesKeyBase64)
  );

  return arrayBufferToBase64(encryptedData);
};

export const decryptAESKeyWithRSA = async (encryptedAesKeyBase64: string, myPrivateKeyBase64: string): Promise<string> => {
  const privateKeyBuffer = base64ToArrayBuffer(myPrivateKeyBase64);
  const cryptoKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );

  const decryptedData = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    cryptoKey,
    base64ToArrayBuffer(encryptedAesKeyBase64)
  );

  return arrayBufferToString(decryptedData);
};

// ── AES Data Encryption (Symmetric) ──────────────────────────────────────────

export const generateAESKey = async (): Promise<string> => {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exportedKey = await window.crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exportedKey);
};

export const encryptTextAES = async (text: string, aesKeyBase64: string): Promise<string> => {
  const keyBuffer = base64ToArrayBuffer(aesKeyBase64);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    stringToArrayBuffer(text)
  );

  // Combine IV and Encrypted data for storage
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  return arrayBufferToBase64(combined.buffer);
};

export const decryptTextAES = async (encryptedDataWithIvBase64: string, aesKeyBase64: string): Promise<string> => {
  const keyBuffer = base64ToArrayBuffer(aesKeyBase64);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const combinedBuffer = base64ToArrayBuffer(encryptedDataWithIvBase64);
  const combinedArray = new Uint8Array(combinedBuffer);
  
  const iv = combinedArray.slice(0, 12);
  const encryptedData = combinedArray.slice(12);

  const decryptedData = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encryptedData
  );

  return arrayBufferToString(decryptedData);
};
