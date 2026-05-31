import { sendEmail } from '../emails';
import { otpEmail } from '../emails/templates';

/**
 * OTP utilities.
 *
 * Code generation + the public sendOtpEmail call site. The actual email
 * rendering (HTML + text + subject + preheader) lives in
 * src/emails/templates/otp.ts so the file is composed against the shared
 * email framework. The provider / transport (Brevo HTTPS API, timeout,
 * structured logging) is owned by src/emails/client.ts and reused by every
 * email type — adding a new email no longer means duplicating that plumbing.
 */

export const generateOtp = (): string =>
  String(Math.floor(100000 + Math.random() * 900000)); // 6-digit

export const OTP_EXPIRY_MINUTES = 10;

/**
 * Send the OTP email. Throws on any delivery failure — the caller (OTP-init
 * endpoint) is expected to map the throw into a user-facing "couldn't send
 * the code, try again" response. Silent failure would leave the user stuck
 * waiting for an email that never arrives.
 */
export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
  const template = otpEmail({ code: otp, expiryMinutes: OTP_EXPIRY_MINUTES });
  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
};
