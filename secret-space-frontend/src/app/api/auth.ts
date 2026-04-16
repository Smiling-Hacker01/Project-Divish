import { apiClient } from './client';
import { SignupData, LoginData, JoinData, AuthResponse } from '../types/auth';

export const authApi = {
  signup: async (data: SignupData) => {
    const res = await apiClient.post<AuthResponse>('/auth/signup', data);
    return res.data;
  },
  join: async (data: JoinData) => {
    const res = await apiClient.post<AuthResponse>('/auth/join', data);
    return res.data;
  },
  login: async (data: LoginData) => {
    // Note: This matches the API endpoint which returns { success, tempToken, user, ... }
    const res = await apiClient.post<any>('/auth/login', data);
    return res.data;
  },
  faceVerify: async (tempToken: string, faceImageBase64: string) => {
    const res = await apiClient.post<AuthResponse>('/auth/face-verify', 
      { faceImage: faceImageBase64 }, 
      { headers: { Authorization: `Bearer ${tempToken}` } }
    );
    return res.data;
  },
  otpRequest: async (tempToken: string) => {
    const res = await apiClient.post<any>('/auth/otp-request', {}, {
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    return res.data;
  },
  otpVerify: async (tempToken: string, otp: string) => {
    const res = await apiClient.post<AuthResponse>('/auth/otp-verify', { otp }, {
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    return res.data;
  },
  enrollFace: async (data: any) => {
    // Requires email/password + faceImage, according to the backend controller
    const res = await apiClient.post<any>('/auth/enroll-face', data);
    return res.data;
  },
  logout: async () => {
    const res = await apiClient.post('/auth/logout');
    return res.data;
  }
};
