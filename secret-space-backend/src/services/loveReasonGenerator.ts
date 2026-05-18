import logger from '../config/logger';

/**
 * Generates a fresh "love reason" via Google Gemini, with a small inline
 * fallback bank for when the API is unavailable / rate-limited / returns
 * empty.
 *
 * Why Gemini specifically: their free tier (gemini-1.5-flash) gives us
 * 1500 requests/day with no card required, which is 750× our peak usage
 * (1 couple, 2 directions, once per day). The API is simple HTTPS — no SDK
 * dependency, just `fetch`.
 *
 * Dedup: callers pass the recipient's last ~10 used reasons so the prompt
 * can explicitly ask Gemini to avoid those themes. Combined with
 * temperature 0.9 and a varied prompt, we shouldn't see repeats in
 * practice for many months.
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const REQUEST_TIMEOUT_MS = 10_000;

// Inline safety net. These read as universal (no partner-specific detail) so
// they fit any couple — used only when Gemini is unreachable. Kept short on
// purpose to match the cadence of personalized reasons.
const FALLBACK_REASONS = [
  "Because the days feel softer when you're in them.",
  'Because you make the small things feel like the big things.',
  'Because of the way you remember the tiny details I forget.',
  'Because being known by you is the best part of any day.',
  "Because you laugh at jokes I didn't even know were jokes.",
  "Because there's a calm in your presence I can't find anywhere else.",
  'Because you let me be exactly who I am, and love it.',
  'Because you make the ordinary feel like a story worth telling.',
];

interface GenerateOpts {
  senderName: string;
  recipientName: string;
  /** Most recent reasons already delivered to this recipient — used for dedup context. */
  recentReasons?: string[];
}

export async function generateLoveReason({
  senderName,
  recipientName,
  recentReasons = [],
}: GenerateOpts): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[LoveReason] GEMINI_API_KEY not set, using fallback bank');
    return pickFallback(recentReasons);
  }

  const promptText = buildPrompt(senderName, recipientName, recentReasons);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 120,
        },
        // Conservative safety thresholds. Couples-app context never needs
        // harassment / hate / sexual / dangerous content; if Gemini ever
        // tries to generate any, block it and we'll fall through to the
        // fallback bank.
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      logger.warn(
        { status: res.status, body: body.slice(0, 200) },
        '[LoveReason] Gemini API returned non-OK, using fallback'
      );
      return pickFallback(recentReasons);
    }

    const json = (await res.json()) as any;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || !text.trim()) {
      logger.warn({ json }, '[LoveReason] Gemini returned empty/invalid, using fallback');
      return pickFallback(recentReasons);
    }

    const cleaned = cleanReason(text);
    // Sanity bounds: anything too short or absurdly long means the model
    // got confused. Fall back rather than send something weird.
    if (cleaned.length < 10 || cleaned.length > 300) {
      logger.warn({ length: cleaned.length, preview: cleaned.slice(0, 80) }, '[LoveReason] Gemini output out of bounds, using fallback');
      return pickFallback(recentReasons);
    }

    return cleaned;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn('[LoveReason] Gemini request timed out, using fallback');
    } else {
      logger.warn({ err: err?.message }, '[LoveReason] Gemini request failed, using fallback');
    }
    return pickFallback(recentReasons);
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(
  senderName: string,
  recipientName: string,
  recentReasons: string[]
): string {
  const recentBlock =
    recentReasons.length > 0
      ? `\n\nReasons recently delivered to ${recipientName} (do NOT repeat these themes or phrasings):\n${recentReasons
          .map((r) => `- ${r}`)
          .join('\n')}`
      : '';

  return `You write a single daily "love reason" for a private app used by couples — a small sincere note sent from one partner to the other.

From: ${senderName}
To: ${recipientName}

Write ONE fresh reason. Rules:
- 1 or 2 sentences, total length under 200 characters
- Warm and specific, not generic
- Sound like a real person — never a Hallmark card or greeting card cliche
- Address ${recipientName} directly using "you"
- Avoid clichés like "the love of my life", "you complete me", "the missing piece"
- Be a little unexpected or surprising in detail

Return ONLY the reason text. No quotes, no preamble, no labels, no explanation.${recentBlock}`;
}

function cleanReason(text: string): string {
  // Strip whitespace, leading/trailing quotes or asterisks, and any "Reason:"-style label the model might
  // have ignored our "no preamble" instruction and added anyway.
  return text
    .trim()
    .replace(/^["'`*\s]+|["'`*\s]+$/g, '')
    .replace(/^(reason|love reason|here'?s? (a|one|your)?( a)? reason)\s*:?\s*/i, '')
    .trim();
}

function pickFallback(recentReasons: string[]): string {
  const recentSet = new Set(recentReasons.map((r) => r.trim()));
  const available = FALLBACK_REASONS.filter((r) => !recentSet.has(r));
  const pool = available.length > 0 ? available : FALLBACK_REASONS;
  return pool[Math.floor(Math.random() * pool.length)];
}
