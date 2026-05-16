import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBaseUrl, apiClient } from './client';
import { VaultItem, VaultPage } from '@/types/api';

const VAULT_TOKEN_KEY = 'secretspace.vaultToken';

export const vaultApi = {
  getToken: () => AsyncStorage.getItem(VAULT_TOKEN_KEY),
  setToken: (t: string) => AsyncStorage.setItem(VAULT_TOKEN_KEY, t),
  clearToken: () => AsyncStorage.removeItem(VAULT_TOKEN_KEY),

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
