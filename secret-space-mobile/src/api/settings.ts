import { apiBaseUrl, apiClient } from './client';
import { User } from '@/types/api';

export const settingsApi = {
  getProfile: async () => (await apiClient.get<{ success: boolean; user: User }>('/settings/profile')).data,
  updateProfile: async (body: { name?: string }) =>
    (await apiClient.put<{ success: boolean; user: User }>('/settings/profile', body)).data,
  registerFcm: async (token: string | null) =>
    (await apiClient.put<{ success: boolean }>('/settings/fcm-token', { token })).data,
  unlinkPartner: async () =>
    (await apiClient.post<{ success: boolean }>('/settings/unlink', {})).data,
  deleteAvatar: async () =>
    (await apiClient.delete<{ success: boolean }>('/settings/avatar')).data,
  // Endpoint URL for multipart avatar uploads — used directly by FileSystem.uploadAsync
  // so the picked image bytes never have to be base64-encoded across the bridge.
  avatarUploadUrl: () => `${apiBaseUrl}/settings/avatar`,
};
