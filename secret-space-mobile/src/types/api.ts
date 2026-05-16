export type Mood = '😊' | '❤️' | '⚡' | '💭' | '😔' | '🌧' | '😣' | '😠' | '😤';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  coupleCode?: string;
  isCreator?: boolean;
  partnerId?: string;
  partnerName?: string;
  partnerAvatar?: string | null;
  faceMFAEnabled?: boolean;
  otpMFAEnabled?: boolean;
  anniversaryDate?: string;
  coupleStatus?: 'active' | 'waiting';
}

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface SignupResponse {
  message: string;
  coupleCode: string;
  tempToken: string;
  user: User;
}

export interface LoginStep1Response {
  success: boolean;
  tempToken: string;
  user: User;
}

export interface DashboardData {
  daysTogether: number;
  myMood: Mood | null;
  partnerMood: Mood | null;
  couplePhoto: string | null;
  todaysReason: string | null;
  nextReasonText: string | null;
  nextReasonDeliveryTime: string | null;
  dailyThought: string;
  partnerStatus: 'active' | 'pending';
}

export type DiaryType = 'text' | 'image' | 'video';

export interface DiaryCommentReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface DiaryComment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  reactions?: DiaryCommentReaction[];
}

export interface DiaryEntry {
  id: string;
  type: DiaryType;
  // Back-compat field: text body OR media URL. Prefer `text`/`mediaUrl` for new code.
  content: string;
  text?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  milestone?: boolean;
  author: 'you' | 'partner';
  authorName?: string;
  authorAvatar?: string | null;
  timestamp: string;
  likes: number;
  comments: number;
  userLiked?: boolean;
  commentsList?: DiaryComment[];
  editedAt?: string | null;
  deletedAt?: string | null;
}

export interface DiaryPage {
  entries: DiaryEntry[];
  nextCursor: string | null;
}

export type CouponStatus = 'Active' | 'Pending' | 'Used' | 'Fulfilled' | 'Expired';

export interface Coupon {
  id: string;
  title: string;
  description: string;
  status: CouponStatus;
  expiry?: string;
  creator: 'you' | 'partner';
  recipient: 'you' | 'partner';
  createdAt: string;
  redeemedAt?: string;
  fulfilledAt?: string;
  reviewRating?: number | null;
  reviewText?: string;
  reviewedAt?: string;
}

export interface LoveBotReason {
  id: string;
  text: string;
  createdAt: string;
}

export interface LoveBotSettings {
  mode: 'off' | 'daily' | 'surprise';
  time: string;
  isCreator: boolean;
  userBAccessGranted: boolean;
  reasons: LoveBotReason[];
}

export interface VaultItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  coupleId: string;
  senderId: string;
  sender: { id: string; name: string };
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  // E2EE wrappings of the per-message AES key — null for plaintext or media-only messages.
  // See [secret-space-mobile/src/services/encryption.ts] for the wire format.
  senderAesKey?: string | null;
  recipientAesKey?: string | null;
  status: 'sent' | 'delivered' | 'read';
  reactions: Record<string, string>;
  deletedForEveryone: boolean;
  deletedForSender: boolean;
  deletedAt?: string | null;
  editedAt?: string | null;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}
