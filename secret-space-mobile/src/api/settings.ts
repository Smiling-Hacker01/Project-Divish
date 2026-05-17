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
  // Face MFA — disable or re-enroll while authenticated. Signup-time enrollment
  // still goes through authApi.enrollFace (gated on email+password); this is for
  // the Settings → "Re-enroll face" path where the user is already signed in.
  deleteFaceDescriptor: async () =>
    (await apiClient.delete<{ success: boolean; removed: number }>('/settings/face-descriptor')).data,
  enrollFace: async (faceImage: string) =>
    (
      await apiClient.post<{ success: boolean }>(
        '/settings/face-descriptor',
        { faceImage },
        { timeout: 60000 }
      )
    ).data,
  // Change password — two steps. `init` verifies the current password, accepts the
  // proposed new one, and emails an OTP. `confirm` verifies the OTP and commits.
  initPasswordChange: async (body: { currentPassword: string; newPassword: string }) =>
    (await apiClient.post<{ success: boolean; email: string }>(
      '/settings/password/init',
      body
    )).data,
  confirmPasswordChange: async (body: { otp: string }) =>
    (await apiClient.post<{ success: boolean }>('/settings/password/confirm', body)).data,
  // Endpoint URL for multipart avatar uploads — used directly by FileSystem.uploadAsync
  // so the picked image bytes never have to be base64-encoded across the bridge.
  avatarUploadUrl: () => `${apiBaseUrl}/settings/avatar`,
};
