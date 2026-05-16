import { apiClient } from './client';
import { DiaryEntry, DiaryType } from '@/types/api';

export const diaryApi = {
  list: async () => (await apiClient.get<DiaryEntry[]>('/diary')).data,
  get: async (id: string) => (await apiClient.get<DiaryEntry>(`/diary/${id}`)).data,

  // Backend accepts: { type, content, mediaUrl? }
  // For text posts: send `content` as the text body.
  // For image/video: pass the data URL (or pure base64) in `content` — backend uploads to Cloudinary.
  create: async (body: { type: DiaryType; content: string; mediaUrl?: string }) =>
    (await apiClient.post<DiaryEntry>('/diary', body)).data,

  update: async (id: string, content: string) =>
    (await apiClient.put<{ success: true }>(`/diary/${id}`, { content })).data,

  remove: async (id: string) =>
    (await apiClient.delete<{ success: true }>(`/diary/${id}`)).data,

  like: async (id: string, liked: boolean) =>
    (await apiClient.post<{ success: true }>(`/diary/${id}/like`, { liked })).data,

  comment: async (id: string, text: string) =>
    (await apiClient.post<{ success: true }>(`/diary/${id}/comments`, { text })).data,

  reactComment: async (id: string, commentId: string, emoji: string) =>
    (await apiClient.post<{ success: true }>(`/diary/${id}/comments/${commentId}/react`, { emoji })).data,
};
