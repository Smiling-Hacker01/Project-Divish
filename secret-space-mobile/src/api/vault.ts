import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './client';
import { VaultItem } from '@/types/api';

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

  list: async () => {
    const token = await vaultApi.getToken();
    return (
      await apiClient.get<VaultItem[]>('/vault', {
        headers: token ? { 'X-Vault-Token': token } : undefined,
      })
    ).data;
  },

  upload: async (body: { fileType: 'image' | 'video'; fileData: string }) => {
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
};
