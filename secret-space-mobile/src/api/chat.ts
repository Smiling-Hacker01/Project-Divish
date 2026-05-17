import { apiBaseUrl, apiClient } from './client';
import { ChatMessage } from '@/types/api';

export type ChatAttachmentKind = 'image' | 'video' | 'audio' | 'file';

export const chatApi = {
  setPublicKey: async (publicKey: string) =>
    (await apiClient.put<{ message: string }>('/chat/keys', { publicKey })).data,
  getPartnerKey: async (partnerId: string) =>
    (await apiClient.get<{ publicKey: string }>(`/chat/keys/${partnerId}`)).data,
  history: async (cursor?: string) =>
    (
      await apiClient.get<{ messages: ChatMessage[]; nextCursor?: string }>('/chat/history', {
        params: cursor ? { cursor } : undefined,
      })
    ).data,
  // Base64 upload — kept for small payloads (images, voice notes).
  uploadAttachment: async (data: string, kind: ChatAttachmentKind) =>
    (
      await apiClient.post<{ url: string; kind: ChatAttachmentKind }>(
        '/chat/upload',
        { data, kind },
        { timeout: 60000 }
      )
    ).data,
  unreadCount: async () =>
    (await apiClient.get<{ count: number }>('/chat/unread-count')).data,
  // Endpoint URL for multipart uploads — used by FileSystem.uploadAsync directly so the
  // bytes never have to be base64-encoded across the bridge.
  multipartUploadUrl: () => `${apiBaseUrl}/chat/upload-multipart`,
};
