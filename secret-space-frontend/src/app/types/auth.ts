export interface SignupData {
  name: string;
  email: string;
  password?: string;
  passwordConfirm?: string;
  anniversaryDate: string;
}

export interface JoinData {
  coupleCode: string;
  name: string;
  email: string;
  password?: string;
  passwordConfirm?: string;
}

export interface LoginData {
  email: string;
  password?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  coupleCode?: string;
  isCreator?: boolean;
  partnerId?: string;
  faceMFAEnabled?: boolean;
  otpMFAEnabled?: boolean;
  anniversaryDate?: string;
  [key: string]: any;
}

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: User;
}
