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

// Fire-and-forget warmup against the unauthenticated /health endpoint. Render's free
// (and Starter) tiers spin a cold instance back up on first hit; calling this during
// app bootstrap lets the backend wake while the splash is showing rather than while
// the user is staring at a hung chat screen. Errors are deliberately swallowed —
// this is purely a perf nudge, never a precondition for anything.
export const prewarmBackend = (): void => {
  const healthUrl = baseURL.replace(/\/api\/?$/, '') + '/health';
  fetch(healthUrl).catch(() => undefined);
};

let logoutHandler: (() => void) | null = null;
export const setLogoutHandler = (fn: () => void) => {
  logoutHandler = fn;
};

// In-memory cache for the three auth tokens, paired with AsyncStorage as
// the persistence layer. Every read prefers the in-memory value when
// present so we're not subject to AsyncStorage's read-after-write race
// under RN new architecture (newArchEnabled: true on this project) —
// AsyncStorage 1.x's setItem resolves the JS-side promise BEFORE the
// native flush is necessarily visible to a subsequent getItem call,
// which produced the "Missing temp token" bug: signup awaited
// tokens.setTemp(...), navigated to OTPScreen, OTPScreen's mount-effect
// fired authApi.otpRequest, the request interceptor read tokens.getTemp()
// — but the AsyncStorage read sometimes returned null even though the
// write had "completed" from the JS-side perspective, and the OTP
// endpoints rejected with 401 "Missing temp token". Memory-first reads
// eliminate the race because the same JS thread that called setTemp can
// always see the value it just wrote. AsyncStorage still gets the value
// for cross-launch persistence — a fresh app process reads from
// AsyncStorage once, populates memory, and subsequent reads stay fast.
let memAccess: string | null = null;
let memRefresh: string | null = null;
let memTemp: string | null = null;

export const tokens = {
  getAccess: async (): Promise<string | null> => {
    if (memAccess !== null) return memAccess;
    const v = await AsyncStorage.getItem(TOKEN_KEY);
    if (v) memAccess = v;
    return v;
  },
  getRefresh: async (): Promise<string | null> => {
    if (memRefresh !== null) return memRefresh;
    const v = await AsyncStorage.getItem(REFRESH_KEY);
    if (v) memRefresh = v;
    return v;
  },
  getTemp: async (): Promise<string | null> => {
    if (memTemp !== null) return memTemp;
    const v = await AsyncStorage.getItem(TEMP_TOKEN_KEY);
    if (v) memTemp = v;
    return v;
  },
  setSession: async (access: string, refresh: string) => {
    // Memory write is synchronous — any in-process read after this point
    // is guaranteed to see the new value, regardless of how the native
    // AsyncStorage flush is sequenced.
    memAccess = access;
    memRefresh = refresh;
    await AsyncStorage.multiSet([
      [TOKEN_KEY, access],
      [REFRESH_KEY, refresh],
    ]);
  },
  setTemp: async (t: string) => {
    memTemp = t;
    await AsyncStorage.setItem(TEMP_TOKEN_KEY, t);
  },
  clearTemp: async () => {
    memTemp = null;
    await AsyncStorage.removeItem(TEMP_TOKEN_KEY);
  },
  clearAll: async () => {
    memAccess = null;
    memRefresh = null;
    memTemp = null;
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, TEMP_TOKEN_KEY]);
  },
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
