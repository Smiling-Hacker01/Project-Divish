import { apiClient } from './client';
import { DashboardData } from '@/types/api';

export interface RefreshReasonResponse {
  reason: string;
}

export const dashboardApi = {
  get: async () => (await apiClient.get<DashboardData>('/dashboard')).data,
  // refreshReason — backend returns 200 with { reason } on success or 429 with
  // { error: 'cooldown', retryAfterSeconds } if the per-user 60s window is
  // active. The caller decides how to surface 429 (HomeScreen shows a warm
  // in-voice toast rather than a technical error).
  refreshReason: async () =>
    (await apiClient.post<RefreshReasonResponse>('/dashboard/refresh-reason')).data,
  uploadPhoto: async (image: string) =>
    (await apiClient.post<{ success: boolean; photoUrl: string }>('/dashboard/photo', { image })).data,
  removePhoto: async () => (await apiClient.delete<{ success: boolean }>('/dashboard/photo')).data,
};
