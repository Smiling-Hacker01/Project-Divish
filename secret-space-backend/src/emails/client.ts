import logger from '../config/logger';

/**
 * Single entry point for outbound email. Every template ultimately routes
 * through here so we have ONE place to swap providers, add retries, or
 * tap a queue if we ever need to scale beyond the current Brevo-direct
 * dispatch model.
 *
 * Provider: Brevo HTTPS API v3 (api.brevo.com/v3/smtp/email). We use HTTPS
 * instead of SMTP because Render's free tier blocks outbound SMTP ports —
 * Brevo's REST API is the only deliverable path on that host. The free
 * Brevo plan covers 300 emails/day which is wildly more than this app
 * will ever need at 2-user scale.
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 15_000;

export interface SendEmailOptions {
  to: string;
  /** Optional display name for the recipient ("Disha <disha@example.com>"). */
  toName?: string;
  subject: string;
  /** Inline-styled HTML, typically built via layout() + components.ts. */
  html: string;
  /** Plain-text fallback. Improves accessibility AND spam-filter scoring. */
  text: string;
}

/**
 * Send an email. Resolves on Brevo success, throws on any failure path so
 * the caller (the OTP-init endpoint, etc.) can decide whether to surface
 * the error to the user (usually as "we couldn't send the code, try again").
 *
 * The throw-on-failure design is intentional: OTP delivery failures are
 * load-bearing (the user CAN'T proceed without the code), so suppressing
 * them silently would leave them stuck with no signal. Future
 * notification-style emails that prefer fire-and-forget should add their
 * own catch.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'The Secret Space';

  if (!apiKey || !senderEmail) {
    logger.error(
      { hasApiKey: !!apiKey, hasSender: !!senderEmail },
      '[Email] BREVO_API_KEY or BREVO_SENDER_EMAIL not set — cannot send'
    );
    throw new Error('Email service not configured');
  }

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
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: opts.to, ...(opts.toName ? { name: opts.toName } : {}) }],
        subject: opts.subject,
        htmlContent: opts.html,
        // textContent is sent alongside htmlContent — Brevo delivers both,
        // and most mail clients prefer the HTML version while text-only
        // clients + accessibility tools fall back to the plain version.
        // Including text also significantly reduces spam-filter score on
        // Gmail / Outlook.
        textContent: opts.text,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      logger.error(
        { status: res.status, body: body.slice(0, 300), to: opts.to, subject: opts.subject },
        '[Email] Brevo returned non-OK'
      );
      throw new Error(`Email delivery failed (status ${res.status})`);
    }

    logger.info({ to: opts.to, subject: opts.subject }, '[Email] Sent');
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.error({ to: opts.to, subject: opts.subject }, '[Email] Request timed out');
      throw new Error('Email delivery timed out');
    }
    // Re-throw anything else (network error, JSON parse error, the
    // explicit throws above) so the caller's error path decides what the
    // user sees.
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
