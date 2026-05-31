import logger from '../config/logger';
import { humanize, recordOutcome } from './humanize';

/**
 * Generates a fresh "love reason" via Google Gemini, with a small inline
 * fallback bank for when the API is unavailable / rate-limited / returns
 * empty.
 *
 * Pipeline:
 *   Gemini → humanize() → ship
 *                ↓ (high score)
 *              retry once with anti-pattern hint
 *                ↓ (still high score)
 *              fallback bank
 *
 * The humanizer's design (services/humanize.ts) biases toward transforming
 * imperfect output rather than rejecting it. We expect the bank to serve
 * ~2% of requests in steady state — see /api/admin/humanize-stats for
 * live distribution.
 *
 * Dedup: callers pass the recipient's last ~10 used reasons so the prompt
 * can explicitly ask Gemini to avoid those themes. Combined with
 * temperature 0.9 and a varied prompt, we shouldn't see repeats in
 * practice for many months.
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const REQUEST_TIMEOUT_MS = 10_000;

// Inline safety net. These ship in the APK and display verbatim when Gemini
// is unreachable, so they're the gold standard for voice. Read more like
// one partner texting the other than like a motivational quote: specific,
// slightly self-aware, no Hallmark vocabulary. Updated as we learn what
// actually lands with users.
const FALLBACK_REASONS = [
  'Because you laugh at your own jokes before you even finish telling them.',
  'Because you remember exactly how I like my coffee, even on days I forget myself.',
  'Because the way you say my name sounds different from everyone else’s.',
  'Because you steal the blanket and somehow I still want to sleep next to you.',
  'Because you sing along to songs you don’t actually know the words to.',
  'Because your hand finds mine in the dark without either of us thinking about it.',
  'Because you save the last bite of whatever you’re eating for me.',
  'Because you let me ramble about things you secretly don’t care about.',
  'Because you remember what I told you about my day three weeks ago.',
  'Because you sneeze loud enough to startle the entire apartment.',
  'Because you make ordinary Tuesdays feel like something worth showing up for.',
  'Because you wear my hoodies and I never bother asking for them back.',
  'Because you fight bad days with bad jokes and somehow it works.',
  'Because you know when I need to be left alone, and when I’m only pretending I do.',
  'Because you text me ridiculous things at 2am and I never want it to stop.',
  'Because you cry at the same scene in that one movie every single time.',
  'Because the kitchen sounds different when you’re in it.',
  'Because you check on me when I’m too quiet, and let me be when I’m not.',
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
    recordOutcome('reason', 'fallback');
    return pickFallback(recentReasons);
  }

  // First attempt — vanilla prompt.
  const firstAttempt = await callGemini(apiKey, buildPrompt(senderName, recipientName, recentReasons));
  if (firstAttempt === null) {
    recordOutcome('reason', 'fallback');
    return pickFallback(recentReasons);
  }

  const decision1 = humanize(firstAttempt, { context: 'reason' });
  if (decision1.kind === 'pass') return decision1.text;

  if (decision1.kind === 'retry') {
    // Second attempt — prompt with the focused anti-pattern hint.
    const retryPrompt = buildPrompt(senderName, recipientName, recentReasons, decision1.hint);
    const secondAttempt = await callGemini(apiKey, retryPrompt);
    if (secondAttempt !== null) {
      const decision2 = humanize(secondAttempt, { context: 'reason' });
      if (decision2.kind === 'pass') {
        recordOutcome('reason', 'retry-humanized');
        return decision2.text;
      }
      // If the retry also fails to humanize cleanly, fall back. We do NOT
      // attempt a third Gemini call — bounded cost is more important than
      // squeezing one more shot at Gemini cooperating.
    }
  }

  // decision1 was 'reject' OR the retry path also failed.
  recordOutcome('reason', 'fallback');
  return pickFallback(recentReasons);
}

async function callGemini(apiKey: string, prompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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
        '[LoveReason] Gemini API returned non-OK'
      );
      return null;
    }

    const json = (await res.json()) as any;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || !text.trim()) {
      logger.warn('[LoveReason] Gemini returned empty/invalid response');
      return null;
    }

    return text;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn('[LoveReason] Gemini request timed out');
    } else {
      logger.warn({ err: err?.message }, '[LoveReason] Gemini request failed');
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(
  senderName: string,
  recipientName: string,
  recentReasons: string[],
  antiPatternHint?: string
): string {
  const recentBlock =
    recentReasons.length > 0
      ? `\n\nReasons recently delivered to ${recipientName} (do NOT repeat these themes or phrasings):\n${recentReasons
          .map((r) => `- ${r}`)
          .join('\n')}`
      : '';

  const hintBlock = antiPatternHint
    ? `\n\nYour previous response had patterns to avoid. ${antiPatternHint}\n\nWrite a fresh response that fixes those issues.`
    : '';

  // The prompt is deliberately voice-focused, not topic-focused. We tell
  // Gemini WHO the speaker is (one partner texting the other) and what to
  // sound like, then list the formal anti-patterns to avoid. The
  // humanizer pipeline catches what slips through.
  return `You're writing a single short "reason I love you" line for a private couples app. ${senderName} is sending this to ${recipientName}.

Imagine one partner texting the other a small specific thing they love about them. It should feel like a real human wrote it on their phone, not a greeting card.

Rules:
- One sentence. Roughly 50–180 characters.
- Address ${recipientName} directly with "you". Start the sentence with "Because".
- Be SPECIFIC — a real small detail (a habit, a sound, a tiny moment), not an abstract feeling.
- Sound casual and conversational, the way you'd actually text someone.

Avoid these patterns:
- No em-dashes (—). Use commas or periods.
- No semicolons. Use periods.
- No "X isn't Y, it's Z" antithetical structures.
- No words like: soulmate, commitment, perseverance, the journey, the foundation, the chapter, the work of love, ride or die.
- Don't end with motivational appendages like "every single day" or "always" or "forever".
- Avoid stock phrases: "the love of my life", "you complete me", "you're my everything", "the missing piece".${hintBlock}

Return ONLY the reason text. No quotes, no labels, no explanation.${recentBlock}`;
}

function pickFallback(recentReasons: string[]): string {
  const recentSet = new Set(recentReasons.map((r) => r.trim()));
  const available = FALLBACK_REASONS.filter((r) => !recentSet.has(r));
  const pool = available.length > 0 ? available : FALLBACK_REASONS;
  return pool[Math.floor(Math.random() * pool.length)];
}
