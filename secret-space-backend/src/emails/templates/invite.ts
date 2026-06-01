import { layout, escapeHtml } from '../layout';
import { paragraph, codeBlock, divider } from '../components';

/**
 * Partner invitation email.
 *
 * Sent when the initiator (User A) chooses to invite their partner via email
 * rather than just sharing the couple code through the platform share sheet.
 * The email's job is to make first contact feel like a real invitation from
 * a real person — not a "system-generated verification email" — so the visual
 * leads with the same rose→gold gradient identity the splash screen uses and
 * the headline reads as a card invitation rather than a SaaS notification.
 *
 * Visual structure (top to bottom):
 *   ┌────────────────────────────────────┐
 *   │  ROSE → GOLD GRADIENT HERO         │  matches splash screen aesthetic
 *   │    THE SECRET SPACE  (small caps)  │
 *   │    You're invited.    (big serif)  │
 *   │    {inviter} made a space for the  │
 *   │    two of you.                     │
 *   ├────────────────────────────────────┤
 *   │  WHITE CONTENT CARD                │
 *   │    One short warm explainer        │
 *   │    YOUR INVITE CODE                │
 *   │    [LOVE-XXX-XXX]   (rose mono)    │  the centerpiece
 *   │    How to join (3-step instruction)│
 *   │    ── hairline ──                  │
 *   │    Reassurance footer              │
 *   └────────────────────────────────────┘
 *     The Secret Space · 2026
 *
 * Security note: the email contains the couple code, same code the inviter
 * could have shared via the native share sheet. The security posture is
 * identical — codes are one-shot (couple.userBId becomes non-null on first
 * join), so even if this email is sent to a wrong address the legitimate
 * partner just gets a re-invite. We intentionally do NOT include any other
 * sensitive info (no inviter email, no phone, no relationship details).
 */

export interface InviteTemplateData {
  /** Inviter's display name — used in the hero subtitle and the warm opener. */
  inviterName: string;
  /** Couple code in canonical LOVE-XXX-XXX form. */
  coupleCode: string;
  /**
   * Optional app download URL. When provided, the email surfaces an explicit
   * download CTA. When omitted (e.g. on Render with APP_DOWNLOAD_URL unset
   * during pre-release), the email instead instructs the partner to install
   * the app via the link the inviter is sharing separately.
   */
  appDownloadUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export function inviteEmail(data: InviteTemplateData): RenderedEmail {
  // First-name extraction so the hero subtitle reads as "Vishal made a space"
  // instead of "Vishal Singh Kushwaha made a space" — too long names break
  // the hero's two-line balance. Falls back gracefully if the name is empty.
  const firstName = (data.inviterName.trim().split(/\s+/)[0] || data.inviterName.trim()) || 'Your partner';
  const safeInviterDisplay = escapeHtml(data.inviterName);
  const code = escapeHtml(data.coupleCode);

  // Download instruction — branches on whether APP_DOWNLOAD_URL is wired.
  // With a URL: explicit "Download Secret Space" CTA link in rose. Without:
  // softer copy that doesn't promise a clickable link. Both variants direct
  // the recipient to the "Join with a code" splash button (NOT "Create our
  // space" — that would start a new couple, not join this one).
  const downloadLineHtml = data.appDownloadUrl
    ? paragraph(
        `Download Secret Space, tap <strong>"Join with a code"</strong> on the first screen, and enter the code above.<br/><br/><a href="${escapeHtml(data.appDownloadUrl)}" style="color:#E8637A; text-decoration:underline; font-weight:600;">Download Secret Space →</a>`,
        { muted: true, bottomMargin: 16 }
      )
    : paragraph(
        'Download Secret Space on your phone, tap <strong>"Join with a code"</strong> on the first screen, and enter the code above.',
        { muted: true, bottomMargin: 16 }
      );

  const downloadLineText = data.appDownloadUrl
    ? `\nGet the app: ${data.appDownloadUrl}\n\nOpen Secret Space, tap "Join with a code" on the first screen, and enter the code above.`
    : `\nDownload Secret Space on your phone, tap "Join with a code" on the first screen, and enter the code above.`;

  // The white content card. Hero already carries the brand identity and
  // headline, so the card body opens directly with the warm explainer —
  // no second heading needed, no redundant brand mark.
  const content = [
    paragraph(
      `It's a small private app, just for the two of you. ${safeInviterDisplay} set up a space and is waiting for you to join.`,
      { muted: false, bottomMargin: 28, align: 'center' }
    ),
    paragraph('Your invite code', { muted: true, bottomMargin: 4 }),
    codeBlock(code),
    downloadLineHtml,
    divider(),
    paragraph(
      "If you weren't expecting this, you can ignore the email. The code only works for the two of you.",
      { muted: true, bottomMargin: 0 }
    ),
  ].join('');

  const subject = `${data.inviterName} invited you to The Secret Space`;
  const preheader = `Use this code to join ${data.inviterName}: ${data.coupleCode}`;

  const html = layout({
    subject,
    preheader,
    hero: {
      eyebrow: 'The Secret Space',
      title: "You're invited.",
      subtitle: `${firstName} made a private space, and wants you in it.`,
    },
    content,
  });

  // Plain-text fallback — accessibility (screen readers) and spam-filter
  // scoring both improve when an HTML email ships with a matching text
  // version. The plain version omits the hero gradient (text can't render
  // a gradient) but keeps the same content order so the message survives
  // either renderer the recipient's client picks.
  const text = [
    `${data.inviterName} invited you to The Secret Space.`,
    '',
    `${firstName} made a private space, and wants you in it. It's a small private app, just for the two of you.`,
    '',
    `Your invite code: ${data.coupleCode}`,
    downloadLineText,
    '',
    "If you weren't expecting this, you can ignore the email. The code only works for the two of you.",
  ].join('\n');

  return { subject, preheader, html, text };
}
