import { apiClient } from './client';

export type CouponStatus = 'Active' | 'Pending' | 'Used' | 'Expired';

export interface Coupon {
  id: string;
  title: string;
  description: string;
  status: CouponStatus;
  expiry?: string;
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

  createCoupon: async (data: Partial<Coupon>) => {
    const res = await apiClient.post('/coupons', data);
    return res.data;
  },

  updateCouponStatus: async (id: string, status: CouponStatus) => {
    const res = await apiClient.patch(`/coupons/${id}/status`, { status: status.toLowerCase() });
    return res.data;
  }
};
