/**
 * Push-notification copy lives here so every outbound notification shares one
 * voice. The convention:
 *   - Title: who and what. Person's name first when there is one. No leading
 *     emoji or trailing "!". Short.
 *   - Body: optional supporting line. Often omitted — the title carries the
 *     content. Never "You've received…" / "Your partner just…" / similar
 *     templated patterns.
 *
 * Functions take just the data needed to fill each notification — no logger,
 * no FCM coupling. The caller (controller / cron) handles delivery.
 */

export interface PushCopy {
  title: string;
  body?: string;
}

// LoveBot delivery — the "you have a new reason" notification. The title is
// the entire payload; we don't pre-render the reason in the body because the
// reason itself is end-to-end-stable on the device and the user needs to
// open the app anyway to see Today's Reason on the home card.
export function loveBotDelivered(senderName: string): PushCopy {
  return {
    title: `A reason from ${senderName}`,
  };
}

// Coupon created — partner just made one for the recipient.
export function couponCreated(senderName: string): PushCopy {
  return {
    title: `${senderName} made you a coupon`,
    body: 'Tap to see what it is.',
  };
}

// Coupon redeemed — recipient just cashed it in; the creator (you) needs to
// know it's time to deliver on the promise.
export function couponRedeemed(senderName: string): PushCopy {
  return {
    title: `${senderName} used a coupon`,
    body: 'Time to deliver.',
  };
}

// Coupon approved — creator confirmed they'll fulfill the redeemed coupon.
export function couponApproved(senderName: string): PushCopy {
  return {
    title: `${senderName} approved your coupon`,
  };
}

// Coupon fulfilled — creator marked the promise as done.
export function couponFulfilled(senderName: string): PushCopy {
  return {
    title: `${senderName} marked it done`,
    body: 'Hope it was worth it.',
  };
}
