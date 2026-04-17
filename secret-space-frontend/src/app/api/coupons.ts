import { apiClient } from './client';

export type CouponStatus = 'Active' | 'Pending' | 'Used' | 'Fulfilled' | 'Expired';

export interface Coupon {
  id: string;
  title: string;
  description: string;
  status: CouponStatus;
  expiry?: string;
  redeemedAt?: string;
  fulfilledAt?: string;
  reviewRating?: number;
  reviewText?: string;
  reviewedAt?: string;
  creator: 'you' | 'partner';
  recipient: 'you' | 'partner';
  createdAt: string;
}

export const couponsApi = {
  getCoupons: async (): Promise<Coupon[]> => {
    const res = await apiClient.get<Coupon[]>('/coupons');
    return res.data;
  },

  getCoupon: async (id: string): Promise<Coupon> => {
    const res = await apiClient.get<Coupon>(`/coupons/${id}`);
    return res.data;
  },

  getPendingFulfillments: async (): Promise<Coupon[]> => {
    const res = await apiClient.get<Coupon[]>('/coupons/pending-fulfillments');
    return res.data;
  },

  createCoupon: async (data: Partial<Coupon>) => {
    const res = await apiClient.post('/coupons', data);
    return res.data;
  },

  updateCouponStatus: async (id: string, status: 'active' | 'pending' | 'used' | 'expired') => {
    const res = await apiClient.patch(`/coupons/${id}/status`, { status });
    return res.data;
  },

  fulfillCoupon: async (id: string) => {
    const res = await apiClient.patch(`/coupons/${id}/fulfill`);
    return res.data;
  },

  addReview: async (id: string, review: { rating: number; text?: string }) => {
    const res = await apiClient.post(`/coupons/${id}/review`, review);
    return res.data;
  }
};
