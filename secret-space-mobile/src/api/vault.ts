import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBaseUrl, apiClient } from './client';
import { VaultItem, VaultPage } from '@/types/api';

const VAULT_TOKEN_KEY = 'secretspace.vaultToken';

// Memory-first cache for the vault token, same pattern as api/client.ts
// tokens.* — AsyncStorage 1.x + RN newArchEnabled has a write-then-read
// race where setItem can resolve its JS-side promise before the native
// storage flush is visible to a subsequent getItem from the same JS
// path. The symptom in this file used to be: VaultUnlockScreen calls
// vaultApi.unlock() (which writes the token), then immediately
// navigation.replace('VaultGrid'), then VaultGrid's mount calls
// vaultApi.list() which reads the token — sometimes the token came back
// null and the request went out without the X-Vault-Token header, the
// backend rejected with 401, and the screen looked like the unlock
// didn't take. Same fix as the auth tokens: synchronous in-memory
// assignment on write so any in-process read sees the latest value,
// AsyncStorage stays the persistence layer.
let memVaultToken: string | null = null;

export const vaultApi = {
  getToken: async (): Promise<string | null> => {
    if (memVaultToken !== null) return memVaultToken;
    const v = await AsyncStorage.getItem(VAULT_TOKEN_KEY);
    if (v) memVaultToken = v;
    return v;
  },
  setToken: async (t: string) => {
    memVaultToken = t;
    await AsyncStorage.setItem(VAULT_TOKEN_KEY, t);
  },
  clearToken: async () => {
    memVaultToken = null;
    await AsyncStorage.removeItem(VAULT_TOKEN_KEY);
  },

  unlock: async (password?: string) => {
    const { data } = await apiClient.post<{ success: boolean; token: string }>(
      '/vault/unlock',
      password ? { password } : {}
    );
    if (data.token) await vaultApi.setToken(data.token);
    return data;
  },

  // Cursor-paginated. Pass the previous page's `nextCursor` for the next batch.
  list: async (params?: { cursor?: string; limit?: number }) => {
    const token = await vaultApi.getToken();
    return (
      await apiClient.get<VaultPage>('/vault', {
        headers: token ? { 'X-Vault-Token': token } : undefined,
        params: { cursor: params?.cursor, limit: params?.limit },
      })
    ).data;
  },

  // Create the vault item *after* the file has been uploaded via uploadUrl().
  create: async (body: {
    fileType: 'image' | 'video';
    fileUrl: string;
    thumbnailUrl?: string;
    clientId?: string;
  }) => {
    const token = await vaultApi.getToken();
    return (
      await apiClient.post<VaultItem>('/vault', body, {
        headers: token ? { 'X-Vault-Token': token } : undefined,
      })
    ).data;
  },

  remove: async (id: string) => {
    const token = await vaultApi.getToken();
    return (
      await apiClient.delete<{ success: boolean }>(`/vault/${id}`, {
        headers: token ? { 'X-Vault-Token': token } : undefined,
      })
    ).data;
  },

  // Endpoint URL for FileSystem.uploadAsync — bytes flow as a multipart POST instead
  // of base64 across the React Native bridge.
  uploadUrl: () => `${apiBaseUrl}/vault/upload`,
};
