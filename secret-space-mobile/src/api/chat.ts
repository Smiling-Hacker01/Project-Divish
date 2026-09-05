import { apiBaseUrl, apiClient } from './client';
import { ChatMessage } from '@/types/api';

export type ChatAttachmentKind = 'image' | 'video' | 'audio' | 'file';

export const chatApi = {
  registerDevice: async (payload: {
    deviceId: string;
    publicKey: string;
    keyVersion: number;
    name?: string;
  }) => (await apiClient.post('/chat/devices', payload)).data,
  bootstrapDevice: async (deviceId: string) =>
    (await apiClient.post('/chat/devices/bootstrap', {}, { headers: { 'X-Device-Id': deviceId } })).data,
  requestPairingChallenge: async (deviceId: string) =>
    (await apiClient.post('/chat/devices/pairing-challenges', {}, { headers: { 'X-Device-Id': deviceId } })).data,
  approvePairing: async (deviceId: string, token: string) =>
    (await apiClient.post('/chat/devices/pairing-approvals', { token }, { headers: { 'X-Device-Id': deviceId } })).data,
  revokeDevice: async (currentDeviceId: string, deviceId: string) =>
    (await apiClient.post(`/chat/devices/${deviceId}/revoke`, {}, { headers: { 'X-Device-Id': currentDeviceId } })).data,
  createEpoch: async (deviceId: string, payload: {
    requestId: string;
    envelopes: Array<{ deviceId: string; keyVersion: number; wrappedEpochKey: string }>;
  }) => (await apiClient.post('/chat/epochs', payload, { headers: { 'X-Device-Id': deviceId } })).data,
  epochEnvelopes: async (deviceId: string) =>
    (await apiClient.get('/chat/epochs/envelopes', { headers: { 'X-Device-Id': deviceId } })).data,
  epochRecipients: async (deviceId: string) =>
    (await apiClient.get('/chat/epochs/recipients', { headers: { 'X-Device-Id': deviceId } })).data,
  submitEpochEnvelope: async (deviceId: string, version: number, payload: {
    deviceId: string;
    keyVersion: number;
    wrappedEpochKey: string;
  }) => (await apiClient.post(`/chat/epochs/${version}/envelopes`, payload, { headers: { 'X-Device-Id': deviceId } })).data,
  epochDistributionStatus: async (deviceId: string) =>
    (await apiClient.get('/chat/epochs/distribution-status', { headers: { 'X-Device-Id': deviceId } })).data,
  devices: async () => (await apiClient.get('/chat/devices')).data,
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
