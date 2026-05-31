import { layout, escapeHtml } from '../layout';
import { heading, paragraph, codeBlock, divider } from '../components';

/**
 * OTP / verification code email.
 *
 * Voice: short, warm, not corporate. The email is a moment of trust between
 * the user and the app — it shouldn't read as "compliance boilerplate". We
 * deliberately avoid SaaS phrases like "verify your account" or "complete
 * your signup" and use "sign in to your space" which is closer to the
 * mobile app's voice. The didn't-request-this footer is reassuring rather
 * than scary: instead of "If you didn't request this, your account may be
 * compromised. Contact security immediately." (which is what most products
 * ship), we say "ignore this email, the code expires on its own" — true,
 * helpful, and matches the relationship-app tone.
 *
 * Used for both signup OTP and password-change init — the controller flow
 * is the same on both endpoints, only the place the code lands in the
 * mobile UI differs.
 */

export interface OtpTemplateData {
  code: string;
  expiryMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export function otpEmail(data: OtpTemplateData): RenderedEmail {
  const code = escapeHtml(data.code);
  const minutes = data.expiryMinutes;

  // The inner card content — composed from the component helpers so the
  // rest of the chrome (DOCTYPE, head, outer table, footer, dark-mode
  // styles, etc.) is provided by layout().
  const content = [
    heading('Sign in to your space.'),
    paragraph("Use this code to confirm it's you.", { muted: true, bottomMargin: 8 }),
    codeBlock(code),
    paragraph(`This expires in ${minutes} minutes. Keep it to yourself.`, {
      muted: true,
      bottomMargin: 0,
    }),
    divider(),
    paragraph(
      "If this wasn't you, you can ignore this email. The code expires on its own.",
      { muted: true, bottomMargin: 0, align: 'center' }
    ),
  ].join('');

  const subject = 'Your code for The Secret Space';
  const preheader = `Use this code to sign in. It expires in ${minutes} minutes.`;

  const html = layout({ subject, preheader, content });

  // Plain-text fallback — accessibility (screen readers) and spam-filter
  // scoring both improve when an HTML email ships with a matching text
  // version. Body shape mirrors the HTML so the message is identical no
  // matter which renderer the recipient's client picks.
  const text = [
    'Your code for The Secret Space',
    '',
    `Sign in with this code: ${data.code}`,
    '',
    `This expires in ${minutes} minutes. Keep it to yourself.`,
    '',
    "If this wasn't you, you can ignore this email. The code expires on its own.",
  ].join('\n');

  return { subject, preheader, html, text };
}
