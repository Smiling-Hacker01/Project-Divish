import { apiClient } from './client';
import { User } from '../types/auth';

export const settingsApi = {
  getProfile: async () => {
    const res = await apiClient.get('/settings/profile');
    return res.data;
  },

  updateProfile: async (data: Partial<User>) => {
    const res = await apiClient.put('/settings/profile', data);
    return res.data;
  },

  updateMFA: async (type: 'face'|'otp', enabled: boolean) => {
    // Face MFA is managed via enroll-face endpoint
    // This is a convenience wrapper for the frontend
    if (type === 'face' && !enabled) {
      // Could add a face removal endpoint in the future
      return { success: true };
    }
    return { success: true };
  },
  
  unlinkPartner: async () => {
    const res = await apiClient.post('/settings/unlink');
    return res.data;
  }
};
