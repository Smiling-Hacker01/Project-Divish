import logger from '../config/logger';

/**
 * OTP delivery via Brevo's transactional HTTPS API.
 *
 * Why not nodemailer/SMTP: Render's free tier blocks outbound SMTP ports (25/465/587)
 * as an anti-abuse measure. HTTPS calls are unrestricted, so any transactional email
 * provider with an HTTP API works. Brevo's free tier (300 emails/day, single-email
 * sender verification, no domain required) was the right fit for our scale.
 */

export const generateOtp = (): string =>
  String(Math.floor(100000 + Math.random() * 900000)); // 6-digit

export const OTP_EXPIRY_MINUTES = 10;

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
// 15s is well under the 20s mobile-client timeout but generous enough that a slow
// Brevo response (rare) doesn't time us out spuriously.
const REQUEST_TIMEOUT_MS = 15_000;

export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'The Secret Space';

  if (!apiKey || !senderEmail) {
    logger.error(
      { hasApiKey: !!apiKey, hasSenderEmail: !!senderEmail },
      '[OTP] Brevo not configured — set BREVO_API_KEY and BREVO_SENDER_EMAIL'
    );
    throw new Error('Email service is not configured');
  }

  const body = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email }],
    subject: 'Your verification code',
    htmlContent: `
      <div style="font-family:sans-serif;max-width:400px;margin:auto">
        <h2 style="color:#e74c8b">The Secret Space 🔐</h2>
        <p>Your one-time verification code is:</p>
        <h1 style="letter-spacing:8px;color:#333">${otp}</h1>
        <p style="color:#999;font-size:13px">Expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this with anyone.</p>
      </div>
    `,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '<no body>');
      logger.error(
        { status: res.status, body: errText, to: email },
        '[OTP] Brevo send failed'
      );
      throw new Error(`Brevo returned ${res.status}`);
    }

    logger.info({ to: email }, '[OTP] Verification email sent');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.error({ to: email }, '[OTP] Brevo request timed out');
      throw new Error('Email send timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
