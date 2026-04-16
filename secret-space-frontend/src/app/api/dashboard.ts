import { apiClient } from './client';

export interface DashboardData {
  daysTogether: number;
  myMood: string;
  partnerMood: string;
  couplePhoto: string | null;
  todaysReason: string | null;
  nextReasonText: string | null;
  nextReasonDeliveryTime: string | null;
  dailyThought: string;
  partnerStatus: 'active' | 'pending';
}

export const dashboardApi = {
  getHomeData: async (): Promise<DashboardData> => {
    const res = await apiClient.get<DashboardData>('/dashboard');
    return res.data;
  },

  updateMood: async (mood: string) => {
    const res = await apiClient.post('/mood', { mood });
    return res.data;
  },

  updateCouplePhoto: async (base64Image: string) => {
    const res = await apiClient.post('/dashboard/photo', { image: base64Image });
    return res.data;
  },

  removeCouplePhoto: async () => {
    const res = await apiClient.delete('/dashboard/photo');
    return res.data;
  }
};
