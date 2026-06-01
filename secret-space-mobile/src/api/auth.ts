import { apiClient, tokens } from './client';
import { AuthResponse, LoginStep1Response, SignupResponse, User } from '@/types/api';

export const authApi = {
  signup: async (body: { name: string; email: string; password: string; anniversaryDate: string }) => {
    const { data } = await apiClient.post<SignupResponse>('/auth/signup', body);
    if (data.tempToken) await tokens.setTemp(data.tempToken);
    return data;
  },

  join: async (body: { name: string; email: string; password: string; coupleCode: string }) => {
    const { data } = await apiClient.post<AuthResponse>('/auth/join', body);
    if (data.accessToken) await tokens.setSession(data.accessToken, data.refreshToken);
    return data;
  },

  login: async (body: { email: string; password: string }) => {
    const { data } = await apiClient.post<LoginStep1Response>('/auth/login', body);
    if (data.tempToken) await tokens.setTemp(data.tempToken);
    return data;
  },

  faceVerify: async (faceImage: string) => {
    const { data } = await apiClient.post<AuthResponse>('/auth/face-verify', { faceImage });
    if (data.accessToken) {
      await tokens.setSession(data.accessToken, data.refreshToken);
      await tokens.clearTemp();
    }
    return data;
  },

  otpRequest: async () => {
    const { data } = await apiClient.post<{ message: string; expiresIn: number }>('/auth/otp-request', {});
    return data;
  },

  otpVerify: async (otp: string) => {
    const { data } = await apiClient.post<AuthResponse>('/auth/otp-verify', { otp });
    if (data.accessToken) {
      await tokens.setSession(data.accessToken, data.refreshToken);
      await tokens.clearTemp();
    }
    return data;
  },

  enrollFace: async (body: { email: string; password: string; faceImage: string }) => {
    const { data } = await apiClient.post<{ success: boolean; message: string }>('/auth/enroll-face', body);
    return data;
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // ignore
    }
    await tokens.clearAll();
  },

  forgotPassword: async (email: string) => {
    const { data } = await apiClient
      .post<{ success: boolean }>('/auth/forgot-password', { email })
      .catch(() => ({ data: { success: true } }));
    return data;
  },

  // Send a branded invitation email to the partner. Caller must be the
  // authenticated creator (User A) of a couple whose User B has not yet
  // joined; the server enforces both checks and returns context-specific
  // 4xx errors otherwise (caller's UI should surface the .response.data.error
  // string verbatim). Rate-limited per-couple (5/24h) and per-recipient-email
  // (1/24h) on the backend.
  sendInvite: async (email: string) => {
    const { data } = await apiClient.post<{ ok: boolean }>('/auth/send-invite', { email });
    return data;
  },
};

export type { AuthResponse, User };
