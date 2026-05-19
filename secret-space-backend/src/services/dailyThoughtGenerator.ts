import logger from '../config/logger';
import redis from '../config/redis';

/**
 * Generates the home screen's "for the hard days" daily reflection via Google
 * Gemini, with Redis-backed per-couple-per-day caching and a small inline
 * fallback bank for when the API is unavailable.
 *
 * Why this is per-couple and date-keyed: every couple should see ONE stable
 * thought for the whole day no matter how many times they open Home. Cache
 * key includes the couple id + an IST date string. When the IST clock
 * crosses midnight the dateKey changes naturally → next request misses cache
 * → fresh Gemini call → new thought for the day.
 *
 * Fallback policy (option A): when Gemini fails we return a bank quote but
 * we DO NOT cache it. That way the next request retries Gemini — important
 * because a brief Gemini outage shouldn't lock the couple into a fallback
 * for the rest of the day.
 *
 * Tone vs. love reasons: the LoveBot reason is a *personal* note ("Because
 * you ..."). This is a *universal* reflection ("We ...", "Love isn't ...").
 * Different categories on purpose so the two home-screen cards never read
 * as duplicates.
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const REQUEST_TIMEOUT_MS = 10_000;
// 30 hours — comfortably longer than 24 so the old key auto-expires after the
// IST dateKey rolls over, without leaving a stale entry around for too long.
const CACHE_TTL_SECONDS = 30 * 60 * 60;

const FALLBACK_THOUGHTS = [
  "The relationships that last aren't the ones without storms — they're the ones built to weather them.",
  "Love isn't a feeling you fall into. It's a choice you keep making.",
  "One hard day doesn't erase a hundred good ones. Keep going.",
  "Every couple that's still together had a moment they almost weren't.",
  "Forgiveness isn't forgetting — it's choosing the next chapter together.",
  "On the days you don't feel it, remember why you chose each other.",
  "The work is the love. There is no version without it.",
  "What you build today is what you'll lean on tomorrow.",
  "Real love is staying when leaving would be simpler.",
  "Distance, busyness, and bad moods are temporary. What you share isn't.",
  "Show up — especially when it's not your turn.",
  "Half of love is patience. The other half is presence.",
  "There is no perfect partner — only the one you keep choosing.",
  "The best relationships look easy because they're worked at hardest.",
  "Staying soft when life makes you hard is the bravest thing you can do for each other.",
];

interface GenerateOpts {
  coupleId: string;
  user1Name: string;
  user2Name: string;
  anniversaryDate?: string | null;
}

export async function generateDailyThought(opts: GenerateOpts): Promise<string> {
  const dateKey = istDateKey();
  const cacheKey = `dailyThought:${opts.coupleId}:${dateKey}`;

  // 1. Cache hit — return immediately. Cheapest path, exercised on every Home
  //    open after the first one each day.
  try {
    const cached = await redis.get(cacheKey);
    if (cached && cached.length > 10) return cached;
  } catch (err: any) {
    logger.warn({ err: err?.message, cacheKey }, '[DailyThought] Redis read failed, proceeding without cache');
  }

  // 2. Cache miss — call Gemini.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[DailyThought] GEMINI_API_KEY not set, using fallback bank');
    return pickFallback(opts.coupleId, dateKey);
  }

  const promptText = buildPrompt(opts);

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
        '[DailyThought] Gemini API returned non-OK, using fallback (not cached)'
      );
      return pickFallback(opts.coupleId, dateKey);
    }

    const json = (await res.json()) as any;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || !text.trim()) {
      logger.warn('[DailyThought] Gemini returned empty/invalid, using fallback (not cached)');
      return pickFallback(opts.coupleId, dateKey);
    }

    const cleaned = cleanThought(text);
    // Tight upper bound on purpose: at fontSize 14 / lineHeight 20 inside the
    // Home card's ~290dp content width, ~140 chars is the sweet spot (2-3
    // lines) and anything past ~180 starts pushing the layout. If Gemini drifts
    // that long it's probably also drifted off-prompt — fall back rather than
    // truncate mid-sentence.
    if (cleaned.length < 10 || cleaned.length > 180) {
      logger.warn({ length: cleaned.length, preview: cleaned.slice(0, 80) }, '[DailyThought] Gemini output out of bounds, using fallback (not cached)');
      return pickFallback(opts.coupleId, dateKey);
    }

    // 3. Success — cache for the rest of the day. Failure to cache is non-fatal
    //    (next request will just call Gemini again).
    redis.set(cacheKey, cleaned, 'EX', CACHE_TTL_SECONDS).catch((err: any) => {
      logger.warn({ err: err?.message, cacheKey }, '[DailyThought] Redis write failed (non-fatal)');
    });

    return cleaned;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn('[DailyThought] Gemini request timed out, using fallback (not cached)');
    } else {
      logger.warn({ err: err?.message }, '[DailyThought] Gemini request failed, using fallback (not cached)');
    }
    return pickFallback(opts.coupleId, dateKey);
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt({ user1Name, user2Name, anniversaryDate }: GenerateOpts): string {
  const since = anniversaryDate ? `, together since ${anniversaryDate}` : '';
  return `You write one short daily reflection for a couple — a "reason not to give up on each other" they will both see when they open their shared private app.

Couple: ${user1Name} and ${user2Name}${since}.

Today's reflection must:
- Be 1 short sentence, between 60 and 140 characters total — this is a hard constraint, not a guideline
- Use universal framing (no "you", no second person — write as if narrating to both partners at once, or use "we", "love", "the work", "couples", etc.)
- Speak to commitment, perseverance, the work of love, choosing each other on hard days
- Be concrete and slightly unexpected — never a Hallmark cliche
- Avoid these phrases entirely: "the love of my life", "you complete me", "ride or die", "soulmate", "happily ever after"

Return ONLY the reflection text. No quotes, no preamble, no labels, no explanation.`;
}

function cleanThought(text: string): string {
  return text
    .trim()
    .replace(/^["'`*\s]+|["'`*\s]+$/g, '')
    .replace(/^(thought|reflection|daily thought|here'?s? (a|one|your)?( a)? reflection)\s*:?\s*/i, '')
    .trim();
}

function pickFallback(coupleId: string, dateKey: string): string {
  // Stable selection per couple per day — same fallback shows all day if
  // Gemini stays down, so the user doesn't see a different "consolation"
  // thought every time they open the app. Hash includes dateKey so the
  // selection rotates day-to-day even if Gemini is down all week.
  const seed = simpleHash(`${coupleId}:${dateKey}`);
  return FALLBACK_THOUGHTS[seed % FALLBACK_THOUGHTS.length];
}

// Simple deterministic non-crypto hash — DJB2. We only need uniform-ish
// distribution across the fallback array indices.
function simpleHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

// Returns YYYY-MM-DD for the current moment in IST. Matches the LoveBot cron's
// timezone logic so "today" means the same thing in both code paths.
function istDateKey(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istNow.toISOString().split('T')[0];
}
