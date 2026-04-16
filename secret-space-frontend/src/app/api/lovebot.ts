import { apiClient } from './client';

export type LoveBotMode = 'off' | 'daily' | 'surprise';
export type LoveBotTarget = 'both' | 'partner_only';

export interface LoveReason {
  id: string;
  text: string;
  createdAt: string;
}

export interface LoveBotSettings {
  mode: LoveBotMode;
  time: string;
  isCreator: boolean;
  userBAccessGranted: boolean;
  reasons: LoveReason[];
}

export const loveBotApi = {
  getSettings: async (): Promise<LoveBotSettings> => {
    const res = await apiClient.get<LoveBotSettings>('/lovebot/settings');
    return res.data;
  },

  updateSettings: async (mode: LoveBotMode, time: string, userBAccessGranted?: boolean) => {
    const res = await apiClient.put('/lovebot/settings', { mode, time, userBAccessGranted });
    return res.data;
  },

  addReason: async (text: string, forPartner: boolean) => {
    const res = await apiClient.post('/lovebot/reasons', { text, forPartner });
    return res.data;
  },

  deleteReason: async (id: string) => {
    const res = await apiClient.delete(`/lovebot/reasons/${id}`);
    return res.data;
  }
};
