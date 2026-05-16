import { apiClient } from './client';
import { LoveBotReason, LoveBotSettings } from '@/types/api';

export const lovebotApi = {
  getSettings: async () => (await apiClient.get<LoveBotSettings>('/lovebot/settings')).data,
  updateSettings: async (body: { mode: 'off' | 'daily' | 'surprise'; time: string; userBAccessGranted?: boolean }) =>
    (await apiClient.put<LoveBotSettings>('/lovebot/settings', body)).data,
  addReason: async (body: { text: string; forPartner: boolean }) =>
    (await apiClient.post<LoveBotReason>('/lovebot/reasons', body)).data,
  removeReason: async (id: string) =>
    (await apiClient.delete<{ success: boolean }>(`/lovebot/reasons/${id}`)).data,
};
