import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Splash: undefined;
  SignUp: undefined;
  OTP: { mode: 'signup' | 'login' };
  FaceEnroll: { email?: string; password?: string };
  CoupleCode: undefined;
  // partnerName is optional context for the WhatsApp pre-filled message;
  // when present we address the partner by name in the share text.
  InvitePartner: { partnerName?: string } | undefined;
  JoinCode: undefined;
  Login: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Diary: undefined;
  Coupons: undefined;
  LoveBot: undefined;
  Vault: NavigatorScreenParams<VaultStackParamList>;
};

export type VaultStackParamList = {
  VaultUnlock: undefined;
  VaultGrid: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  MoodCheckIn: undefined;
  // resumeId lets the failed-post banner reopen an exact pending entry from the
  // diaryQueue instead of starting a blank composer.
  DiaryCreate: { resumeId?: string } | undefined;
  DiaryDetail: { id: string };
  Chat: undefined;
  // couponId present → edit mode (screen pre-loads that coupon and PATCHes
  // instead of POSTing on submit). Absent / undefined → fresh-create flow.
  CouponCreate: { couponId?: string } | undefined;
  CouponDetail: { id: string };
  AddReason: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  FaceReenroll: undefined;
  About: undefined;
  DailyLogin: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
