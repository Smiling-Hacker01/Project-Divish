import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const TOKEN_KEY = 'secretspace.accessToken';
const REFRESH_KEY = 'secretspace.refreshToken';
const TEMP_TOKEN_KEY = 'secretspace.tempToken';

const baseURL = (Constants.expoConfig?.extra?.apiBaseUrl as string) || 'http://localhost:5050/api';

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

let logoutHandler: (() => void) | null = null;
export const setLogoutHandler = (fn: () => void) => {
  logoutHandler = fn;
};

export const tokens = {
  getAccess: () => AsyncStorage.getItem(TOKEN_KEY),
  getRefresh: () => AsyncStorage.getItem(REFRESH_KEY),
  getTemp: () => AsyncStorage.getItem(TEMP_TOKEN_KEY),
  setSession: async (access: string, refresh: string) => {
    await AsyncStorage.multiSet([
      [TOKEN_KEY, access],
      [REFRESH_KEY, refresh],
    ]);
  },
  setTemp: (t: string) => AsyncStorage.setItem(TEMP_TOKEN_KEY, t),
  clearTemp: () => AsyncStorage.removeItem(TEMP_TOKEN_KEY),
  clearAll: () => AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, TEMP_TOKEN_KEY]),
};

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const useTempToken =
    config.url?.includes('/auth/face-verify') ||
    config.url?.includes('/auth/otp-request') ||
    config.url?.includes('/auth/otp-verify');
  const token = useTempToken ? await tokens.getTemp() : await tokens.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let pendingRequests: Array<(t: string | null) => void> = [];

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (!originalRequest) return Promise.reject(error);

    const url = originalRequest.url ?? '';
    // Auth endpoints handle their own token state — never auto-refresh on those.
    // (Vault unlock is fine to refresh because it uses the regular JWT.)
    if (url.includes('/auth/')) return Promise.reject(error);

    if (error.response?.status === 403) {
      await tokens.clearAll();
      logoutHandler?.();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push((newToken) => {
            if (!newToken) return reject(error);
            originalRequest.headers!.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await tokens.getRefresh();
        if (!refreshToken) throw new Error('no refresh');
        const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data;
        await tokens.setSession(accessToken, newRefresh ?? refreshToken);
        pendingRequests.forEach((cb) => cb(accessToken));
        pendingRequests = [];
        originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (e) {
        pendingRequests.forEach((cb) => cb(null));
        pendingRequests = [];
        await tokens.clearAll();
        logoutHandler?.();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const apiBaseUrl = baseURL;
