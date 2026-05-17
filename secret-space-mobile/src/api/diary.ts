import { apiBaseUrl, apiClient } from './client';
import { DiaryEntry, DiaryPage, DiaryType } from '@/types/api';

export const diaryApi = {
  // Cursor-paginated feed. Pass the previous page's nextCursor for the next batch.
  list: async (params?: { cursor?: string; limit?: number }) =>
    (
      await apiClient.get<DiaryPage>('/diary', {
        params: { cursor: params?.cursor, limit: params?.limit },
      })
    ).data,

  get: async (id: string) => (await apiClient.get<DiaryEntry>(`/diary/${id}`)).data,

  // Discrete fields only — no more base64-in-content. Media must already be uploaded
  // via /diary/upload, returning a Cloudinary URL passed here as `mediaUrl`. Pass
  // clientId from the retry queue so the backend can dedupe replayed sends.
  create: async (body: {
    type: DiaryType;
    content?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    milestone?: boolean;
    clientId?: string;
  }) => (await apiClient.post<DiaryEntry>('/diary', body)).data,

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

  // Endpoint URL for multipart uploads. Used by FileSystem.uploadAsync directly so the
  // file bytes never have to be base64-encoded across the React Native bridge.
  uploadUrl: () => `${apiBaseUrl}/diary/upload`,
};
