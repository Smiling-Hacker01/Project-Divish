import { apiClient } from './client';
import { Coupon, CouponStatus } from '@/types/api';

type StatusLowercase = 'active' | 'pending' | 'used' | 'fulfilled' | 'expired';

export const couponsApi = {
  list: async () => (await apiClient.get<Coupon[]>('/coupons')).data,
  get: async (id: string) => (await apiClient.get<Coupon>(`/coupons/${id}`)).data,
  pendingFulfillments: async () =>
    (await apiClient.get<Coupon[]>('/coupons/pending-fulfillments')).data,

  // Backend wants `expiresAt` not `expiry`.
  create: async (body: { title: string; description: string; expiresAt?: string }) =>
    (await apiClient.post<Coupon>('/coupons', body)).data,

  // PATCH /coupons/:id/status — body must be lowercase status string.
  // Lifecycle: recipient sets 'pending' (redeem) → creator sets 'used' (approve) → creator hits /fulfill
  setStatus: async (id: string, status: CouponStatus | StatusLowercase) => {
    const value = (typeof status === 'string' ? status.toLowerCase() : status) as StatusLowercase;
    return (await apiClient.patch<{ success: true }>(`/coupons/${id}/status`, { status: value })).data;
  },

  fulfill: async (id: string) =>
    (await apiClient.patch<{ success: true }>(`/coupons/${id}/fulfill`, {})).data,

  review: async (id: string, rating: number, text?: string) =>
    (await apiClient.post<{ success: true }>(`/coupons/${id}/review`, { rating, text })).data,
};
