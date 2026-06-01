import logger from '../config/logger';
import redis from '../config/redis';
import { humanize, recordOutcome } from './humanize';

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
 * Fallback policy: when Gemini fails OR the humanizer rejects on retry, we
 * return a bank quote but DO NOT cache it. That way the next request retries
 * Gemini — important because a brief Gemini hiccup shouldn't lock the couple
 * into a fallback for the rest of the day.
 *
 * Pipeline mirrors loveReasonGenerator: Gemini → humanize → ship | retry →
 * humanize → ship | fallback. See services/humanize.ts for the full design.
 *
 * Tone vs. love reasons: the LoveBot reason is a *personal* note ("Because
 * you ..."). This is a *universal* observation about relationships ("we
 * ...", "love is ...", "couples ..."). Different categories on purpose so
 * the two home-screen cards never read as duplicates.
 */

// Same model + reasoning as in loveReasonGenerator.ts — gemini-2.5-flash is
// the current stable Flash workhorse after the 1.5 family was sunset.
// Pinning to the explicit version (not `gemini-flash-latest`) so behavior
// stays predictable until we choose to bump again.
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const REQUEST_TIMEOUT_MS = 10_000;
// 30 hours — comfortably longer than 24 so the old key auto-expires after the
// IST dateKey rolls over, without leaving a stale entry around for too long.
const CACHE_TTL_SECONDS = 30 * 60 * 60;

// Small honest observations about relationships, not motivational coaching.
// Each one should land like a friend saying something true at a coffee
// shop, not like an Instagram quote card. Updated as we learn what
// resonates with real users.
const FALLBACK_THOUGHTS = [
  "When you're arguing about dishes, it's almost never about the dishes.",
  "Some days you'll feel further apart for no reason. By tomorrow you'll have forgotten why.",
  "The boring part is the part you'll miss when it's gone.",
  "You don't have to be okay at the same time. Just be there when one of you isn't.",
  "Love is mostly noticing. And sometimes deciding not to mention what you noticed.",
  "The person you fell for is still in there. They just got busy.",
  "If they said it after 11pm, they probably didn't mean it.",
  "If you can sit in the same room without talking and feel fine, that's most of it.",
  "Half of what keeps a couple together is being too tired to argue about the small stuff.",
  "Sometimes all someone wants is for you to ask if they're okay.",
  "Apologies that come too fast usually aren't apologies.",
  "Walking past their socks on the floor and saying nothing counts as love.",
  "You'll have weeks where it feels routine. That's not the relationship breaking. That's the relationship.",
  "Most couples that lasted had a hundred moments where they almost didn't.",
  "Nobody fights perfectly. Sometimes the best you can do is apologize for how you said it.",
  "The version of them you fell for didn't come with a warranty. It came with a Tuesday.",
  "You'll get one bad day, then a good one, then a bunch of medium ones. That's most of it.",
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
    logger.warn(
      { err: err?.message, cacheKey },
      '[DailyThought] Redis read failed, proceeding without cache'
    );
  }

  // 2. Cache miss — call Gemini, humanize, possibly retry, possibly fallback.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[DailyThought] GEMINI_API_KEY not set, using fallback bank');
    recordOutcome('thought', 'fallback');
    return pickFallback(opts.coupleId, dateKey);
  }

  const firstAttempt = await callGemini(apiKey, buildPrompt(opts));
  if (firstAttempt !== null) {
    const decision1 = humanize(firstAttempt, { context: 'thought' });
    if (decision1.kind === 'pass') {
      // Cache the humanized text (not the raw Gemini output).
      await persistToCache(cacheKey, decision1.text);
      return decision1.text;
    }

    if (decision1.kind === 'retry') {
      const retryPrompt = buildPrompt(opts, decision1.hint);
      const secondAttempt = await callGemini(apiKey, retryPrompt);
      if (secondAttempt !== null) {
        const decision2 = humanize(secondAttempt, { context: 'thought' });
        if (decision2.kind === 'pass') {
          recordOutcome('thought', 'retry-humanized');
          await persistToCache(cacheKey, decision2.text);
          return decision2.text;
        }
      }
    }
  }

  // Either Gemini failed outright, the first response was rejected, or the
  // retry was also rejected. Fall back — and intentionally do NOT cache, so
  // a transient Gemini outage doesn't lock the couple into the same bank
  // quote for the rest of the day.
  recordOutcome('thought', 'fallback');
  return pickFallback(opts.coupleId, dateKey);
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
          // Same reasoning as loveReasonGenerator — disable the 2.5-family's
          // default "thinking" pass so maxOutputTokens isn't consumed by
          // internal reasoning tokens before any visible output is produced.
          thinkingConfig: { thinkingBudget: 0 },
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
        '[DailyThought] Gemini API returned non-OK'
      );
      return null;
    }

    const json = (await res.json()) as any;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || !text.trim()) {
      logger.warn('[DailyThought] Gemini returned empty/invalid response');
      return null;
    }
    return text;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn('[DailyThought] Gemini request timed out');
    } else {
      logger.warn({ err: err?.message }, '[DailyThought] Gemini request failed');
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function persistToCache(cacheKey: string, text: string): Promise<void> {
  // Non-fatal — cache failures don't break the response, the next request
  // just calls Gemini again.
  try {
    await redis.set(cacheKey, text, 'EX', CACHE_TTL_SECONDS);
  } catch (err: any) {
    logger.warn({ err: err?.message, cacheKey }, '[DailyThought] Redis write failed (non-fatal)');
  }
}

function buildPrompt({ user1Name, user2Name, anniversaryDate }: GenerateOpts, antiPatternHint?: string): string {
  const since = anniversaryDate ? `, together since ${anniversaryDate}` : '';
  const hintBlock = antiPatternHint
    ? `\n\nYour previous response had patterns to avoid. ${antiPatternHint}\n\nWrite a fresh response that fixes those issues.`
    : '';

  // The voice we want: a friend saying something true and small at a coffee
  // shop, not a motivational coach. Specific, slightly ordinary, slightly
  // imperfect. We name the couple in the prompt but DO NOT have Gemini
  // address them — the output uses universal framing ("we", "couples",
  // "love") so it complements the LoveBot card (which IS personal).
  return `You're writing one short observation about long-term relationships for a private couples app. The couple is ${user1Name} and ${user2Name}${since}.

Imagine a friend saying something true and small about love at a coffee shop. Not motivational. Not advice. Just a real thought from someone who's been in a relationship for a while.

Rules:
- One short sentence. Roughly 50–140 characters.
- Universal framing — write about "couples", "love", "we", "the small things". Don't address either partner directly.
- Be CONCRETE — a specific small observation, not an abstraction.
- Sound like something a real person would actually say, not write.

Avoid these patterns:
- No em-dashes (—). Use commas or periods.
- No semicolons. Use periods.
- No "X isn't Y, it's Z" antithetical structures.
- No openings like "Real love is", "True love is", or "Love isn't".
- No words like: soulmate, commitment, perseverance, the journey, the foundation, the chapter, the work of love, ride or die.
- Don't end with motivational appendages like "every single day" or "always" or "forever".${hintBlock}

Return ONLY the observation. No quotes, no labels, no explanation.`;
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
