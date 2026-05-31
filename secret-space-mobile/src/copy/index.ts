/**
 * Centralized user-facing copy. The goal is one cohesive voice across the
 * app — warm, specific, conversational, slightly self-aware. NOT motivational,
 * NOT corporate, NOT Hallmark.
 *
 * Most short strings still live inline at the call site (a "Save" button
 * doesn't need its own constant), but anything that:
 *   - is duplicated across screens (errors, retries),
 *   - is sensitive to voice consistency (empty states, info modals), OR
 *   - might need translation later (eventually)
 * goes here.
 *
 * The error variants are context-specific by design — vague "Try again later"
 * was duplicated in 6+ places and gave the user no information; calling
 * sites should pick the most accurate variant rather than defaulting to one.
 */

export const errors = {
  // Generic — only use when the failure mode is genuinely ambiguous.
  generic: "Something didn't go through. Try once more.",

  // Send operations (chat send, mood update, etc.).
  networkSend: "Didn't go through. Try again in a moment.",

  // Fetch operations (loading data, refreshing a screen).
  networkFetch: "Couldn't load this. Pull down to refresh.",

  // The chat connection specifically — the user sees a banner-style message
  // when the socket disconnects, so this is short and matches that context.
  chatOffline: 'Reconnecting to chat.',

  // 429 / rate-limited / cooldown — used for the Today's Reason refresh
  // and any future cooldown-gated action.
  cooldown: 'Just a second.',

  // Server is unreachable / 5xx.
  serverDown: "The server's catching up. Hold tight.",

  // The user denied a permission we need.
  permissionDenied: 'We need permission for this. Open Settings to allow it.',
} as const;

export const emptyStates = {
  diary: {
    title: 'Nothing here yet.',
    body: 'Write today down — even just a sentence.',
  },
  vault: {
    title: 'Nothing in here yet.',
    body: 'Add a photo or video.',
  },
  couponsMine: {
    title: "You haven't made any coupons yet.",
    body: 'Make one when you feel like it.',
  },
  couponsPartner: {
    title: 'No coupons here yet.',
    body: "Promises you've been given will appear here.",
  },
  lovebotReasons: {
    title: 'Nothing in the queue.',
    body: 'Your bot will write one when it’s time. Add your own to send something personal instead.',
  },
} as const;

export const loveBotInfo = {
  intro: 'Sends your partner one reason you love them. You write it, or the bot picks one.',
  modes: {
    daily: 'One reason every day at the time you pick. Steady, no thinking required.',
    surprise: "Random delivery through the week. They won't know when it's coming.",
    contribute: 'Flip the switch and your partner can add reasons too.',
    delivery: 'Arrives as a notification, sits on their Home for the day.',
  },
} as const;
