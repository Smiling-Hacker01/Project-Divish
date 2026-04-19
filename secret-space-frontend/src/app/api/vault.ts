import { apiClient } from './client';
import { NativeBiometric, BiometryType, BiometricAuthError } from '@capgo/capacitor-native-biometric';

export interface VaultItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  timestamp: string;
}

export interface BiometricStatus {
  available: boolean;
  biometryType: 'fingerprint' | 'face' | 'iris' | 'none';
  reason?: string;
}

/**
 * Checks whether biometric hardware is present AND credentials are enrolled.
 * Gracefully returns { available: false } on web / emulator / unenrolled devices.
 */
export const checkBiometricAvailability = async (): Promise<BiometricStatus> => {
  try {
    const result = await NativeBiometric.isAvailable();

    if (!result.isAvailable) {
      return {
        available: false,
        biometryType: 'none',
        reason: result.errorCode === BiometricAuthError.BIOMETRICS_NOT_ENROLLED
          ? 'No fingerprint enrolled. Register one in device Settings.'
          : 'Biometric authentication is not available on this device.',
      };
    }

    const typeMap: Record<number, BiometricStatus['biometryType']> = {
      [BiometryType.FINGERPRINT]: 'fingerprint',
      [BiometryType.FACE_AUTHENTICATION]: 'face',
      [BiometryType.IRIS_AUTHENTICATION]: 'iris',
    };

    return {
      available: true,
      biometryType: typeMap[result.biometryType] || 'fingerprint',
    };
  } catch {
    // NativeBiometric plugin not available (web browser, emulator without biometric support)
    return {
      available: false,
      biometryType: 'none',
      reason: 'Biometric authentication is not supported in this environment.',
    };
  }
};

export const vaultApi = {
  /**
   * Prompts the native biometric dialog, then requests a vault session token from the backend.
   * Throws a descriptive error if the user cancels or verification fails.
   */
  verifyAccess: async (): Promise<{ success: boolean; token: string }> => {
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Access your Personal Vault',
        title: 'Vault Unlock',
        subtitle: 'Use your biometric to unlock',
        description: 'Verify your identity to access private content',
      });
    } catch (e: any) {
      // Provide specific, user-friendly messages based on the native error
      const message =
        e?.code === 'BIOMETRIC_DISMISSED'
          ? 'Authentication was cancelled.'
          : e?.code === 'BIOMETRIC_LOCKED_OUT'
            ? 'Too many failed attempts. Try again later or use your password.'
            : 'Biometric verification failed. Please try again or use your password.';
      throw new Error(message);
    }

    // Biometric passed on-device – ask backend for a vault session token
    const res = await apiClient.post<{ success: boolean; token: string }>('/vault/unlock', {});
    return res.data;
  },

  /**
   * Password fallback – sends the account password to the backend for verification.
   */
  verifyAccessPasswordFallback: async (password: string): Promise<{ success: boolean; token: string }> => {
    const res = await apiClient.post<{ success: boolean; token: string }>('/vault/unlock', { password });
    return res.data;
  },

  getItems: async (token: string): Promise<VaultItem[]> => {
    const res = await apiClient.get<VaultItem[]>('/vault', {
      headers: { 'X-Vault-Token': token },
    });
    return res.data;
  },

  createItem: async (token: string, type: 'photo' | 'video', base64Data: string) => {
    const res = await apiClient.post(
      '/vault',
      { fileType: type === 'photo' ? 'image' : 'video', fileData: base64Data },
      { headers: { 'X-Vault-Token': token } },
    );
    return res.data;
  },

  deleteItem: async (token: string, id: string) => {
    const res = await apiClient.delete(`/vault/${id}`, {
      headers: { 'X-Vault-Token': token },
    });
    return res.data;
  },
};
