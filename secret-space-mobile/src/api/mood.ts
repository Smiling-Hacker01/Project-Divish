import { apiClient } from './client';
import { Mood } from '@/types/api';

export const moodApi = {
  get: async () =>
    (
      await apiClient.get<{
        myMood: Mood | null;
        partnerMood: Mood | null;
        myNote?: string | null;
        partnerNote?: string | null;
      }>('/mood')
    ).data,

  // Optional `note` is appended to the partner's push notification by the backend.
  set: async (mood: Mood, note?: string) =>
    (
      await apiClient.post<{ success: boolean; mood: Mood; note: string | null }>('/mood', {
        mood,
        ...(note ? { note } : {}),
      })
    ).data,
};
