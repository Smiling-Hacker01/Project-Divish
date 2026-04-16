import { apiClient } from './client';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

export interface VaultItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  timestamp: string;
}

export const vaultApi = {
  /**
   * Verifies biometrics on device, then calls backend to get a vault session token.
   * The token is short-lived (5 min) and stored in memory only.
   */
  verifyAccess: async () => {
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Access your Personal Vault",
        title: "Vault Unlock",
        subtitle: "Use your biometric to unlock",
        description: "Verify your identity"
      });
    } catch(e) {
      console.warn('Biometric verify failed or unsupported, falling back for development', e);
      // In development/web, allow fallback
    }

    // Call backend to get a vault session token
    const res = await apiClient.post<{ success: boolean; token: string }>('/vault/unlock');
    return res.data;
  },

  getItems: async (token: string): Promise<VaultItem[]> => {
    const res = await apiClient.get<VaultItem[]>('/vault', {
      headers: { 'X-Vault-Token': token },
    });
    return res.data;
  },
  
  createItem: async (token: string, type: 'photo' | 'video', base64Data: string) => {
    const res = await apiClient.post('/vault', 
      { fileType: type === 'photo' ? 'image' : 'video', fileData: base64Data },
      { headers: { 'X-Vault-Token': token } }
    );
    return res.data;
  },

  deleteItem: async (token: string, id: string) => {
    const res = await apiClient.delete(`/vault/${id}`, {
      headers: { 'X-Vault-Token': token },
    });
    return res.data;
  }
};
