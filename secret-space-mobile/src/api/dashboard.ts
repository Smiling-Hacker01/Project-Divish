import { apiClient } from './client';
import { DashboardData } from '@/types/api';

export const dashboardApi = {
  get: async () => (await apiClient.get<DashboardData>('/dashboard')).data,
  uploadPhoto: async (image: string) =>
    (await apiClient.post<{ success: boolean; photoUrl: string }>('/dashboard/photo', { image })).data,
  removePhoto: async () => (await apiClient.delete<{ success: boolean }>('/dashboard/photo')).data,
};
