import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Include credentials if we eventually use HTTP-only cookies
  // withCredentials: true,
});

// Request interceptor: attach token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle token refresh & global errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    
    // Do not attempt token refresh or force logout for auth endpoints or vault unlock
    if (originalRequest?.url?.includes('/auth/') || originalRequest?.url?.includes('/vault/unlock')) {
      return Promise.reject(error);
    }

    // If 403 Forbidden (e.g. user deleted from db), force log out
    if (error.response?.status === 403) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // If 401 Unauthorized and not already retrying, try to refresh token
    if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
      (originalRequest as any)._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (refreshToken) {
        try {
          const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data;
          
          if (newAccessToken) {
             localStorage.setItem('accessToken', newAccessToken);
             if (newRefreshToken) {
               localStorage.setItem('refreshToken', newRefreshToken);
             }
             originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
             return apiClient(originalRequest);
          }
        } catch (refreshError) {
          // Refresh totally failed, log user out
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        // No refresh token available, force login
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
      }
    }

    // Pass the error back down for specific component handling
    return Promise.reject(error);
  }
);
