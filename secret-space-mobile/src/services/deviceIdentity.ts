import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'secretspace.deviceId';
const DEVICE_KEY_VERSION = 1;

export const getOrCreateDeviceId = async (): Promise<string> => {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
};

export const getDeviceKeyVersion = (): number => DEVICE_KEY_VERSION;

// A device identity is account-scoped. Rotate it when a user logs out so a second
// account on the same installation cannot collide with or inherit the first account's
// registered device record.
export const clearDeviceIdentity = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY).catch(() => undefined);
};
