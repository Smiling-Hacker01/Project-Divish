import logger from '../config/logger';

/**
 * Humanization pipeline for Gemini-generated content.
 *
 * Goal: strip the most obvious AI tells (em-dashes, motivational coach voice,
 * Hallmark openers) WITHOUT compressing every output into the same voice. The
 * design bias is transform > retry > reject. Most legitimate Gemini output
 * should pass through Layer 1 cleanup unchanged in meaning and reach the user
 * as-is; only outputs that score high on AI-tell patterns trigger a single
 * retry with an inline anti-pattern hint, and only the worst of the worst
 * fall back to the static bank.
 *
 * Three layers:
 *   1. TRANSFORM (deterministic, always runs)   — em-dashes → comma,
 *      semicolons → period, smart-quote normalization, whitespace collapse,
 *      strip wrapping noise, sentence-case the opener, ensure terminal
 *      punctuation. This layer NEVER rejects.
 *
 *   2. SCORE (sum penalties for each AI-tell pattern detected)
 *      Patterns are weighted by how strongly they signal "machine wrote
 *      this": greeting-card openers score the highest, soft tells like a
 *      single coach noun score the lowest. Each pattern category is bounded
 *      so no single signal can dominate the score.
 *
 *   3. DECIDE based on score:
 *        0–2  → pass clean (the vast majority)
 *        3–4  → pass with a soft warning logged (still ships to user)
 *        5–7  → return { kind: 'retry' } — caller re-prompts Gemini once
 *        8+   → return { kind: 'reject' } — caller falls back to the bank
 *
 *      Hard rejects (skip scoring): empty after cleanup, AI self-references
 *      ("As an AI…", "language model"), all-caps, exceeds the generator's
 *      length cap.
 *
 * Observability: in-memory counters track each path's frequency plus the
 * running score average. Exposed via GET /api/admin/humanize-stats so we
 * can tune thresholds based on real production usage. Counters reset on
 * server restart (acceptable for Render free-tier — we get a clean slate
 * after each deploy and can verify the system is behaving via the logs).
 */

export interface HumanizeStats {
  passClean: number;
  passWarning: number;
  retryRequested: number;
  retryHumanized: number; // retried + then humanized successfully (still pass kind)
  fallbackReturned: number; // outright rejects that forced bank usage
  hardReject: number;
  totalScore: number;
  totalCalls: number;
  byContext: Record<'reason' | 'thought', { calls: number; fallbacks: number }>;
}

const stats: HumanizeStats = {
  passClean: 0,
  passWarning: 0,
  retryRequested: 0,
  retryHumanized: 0,
  fallbackReturned: 0,
  hardReject: 0,
  totalScore: 0,
  totalCalls: 0,
  byContext: {
    reason: { calls: 0, fallbacks: 0 },
    thought: { calls: 0, fallbacks: 0 },
  },
};

export function getHumanizeStats(): HumanizeStats & { averageScore: number; fallbackRate: number } {
  return {
    ...stats,
    averageScore: stats.totalCalls > 0 ? Number((stats.totalScore / stats.totalCalls).toFixed(2)) : 0,
    fallbackRate: stats.totalCalls > 0 ? Number((stats.fallbackReturned / stats.totalCalls).toFixed(3)) : 0,
  };
}

/**
 * Bump a stat counter from outside the humanize() call path. Used by the
 * generators to record when they actually shipped a fallback vs. a retried
 * success — the humanize() function itself can't know what the caller did
 * with a retry/reject decision.
 */
export function recordOutcome(context: 'reason' | 'thought', outcome: 'retry-humanized' | 'fallback'): void {
  if (outcome === 'retry-humanized') stats.retryHumanized++;
  if (outcome === 'fallback') {
    stats.fallbackReturned++;
    stats.byContext[context].fallbacks++;
  }
}

export type HumanizeDecision =
  | { kind: 'pass'; text: string; score: number }
  | { kind: 'retry'; score: number; hint: string }
  | { kind: 'reject'; score: number; reason: string };

export interface HumanizeOptions {
  context: 'reason' | 'thought';
  /** Per-generator hard length cap. Default: 220 for reason, 180 for thought. */
  maxLength?: number;
}

export function humanize(raw: string, opts: HumanizeOptions): HumanizeDecision {
  const { context } = opts;
  const maxLength = opts.maxLength ?? (context === 'reason' ? 220 : 180);

  stats.totalCalls++;
  stats.byContext[context].calls++;

  // Layer 1 — Transform
  const t = transform(raw);

  // Hard rejects — bypass scoring entirely
  if (t.length < 10) {
    stats.hardReject++;
    return { kind: 'reject', score: 999, reason: 'too-short' };
  }
  if (containsAISelfReference(t)) {
    stats.hardReject++;
    return { kind: 'reject', score: 999, reason: 'ai-self-reference' };
  }
  if (isAllCaps(t)) {
    stats.hardReject++;
    return { kind: 'reject', score: 999, reason: 'all-caps' };
  }
  if (t.length > maxLength) {
    stats.hardReject++;
    return { kind: 'reject', score: 999, reason: 'too-long' };
  }

  // Layer 2 — Score
  const { score, detected } = scoreAITells(t);
  stats.totalScore += score;

  // Layer 3 — Decide
  if (score <= 2) {
    stats.passClean++;
    return { kind: 'pass', text: t, score };
  }
  if (score <= 4) {
    stats.passWarning++;
    logger.info(
      { context, score, detected, preview: t.slice(0, 80) },
      '[humanize] soft warning'
    );
    return { kind: 'pass', text: t, score };
  }
  if (score <= 7) {
    stats.retryRequested++;
    logger.info(
      { context, score, detected, preview: t.slice(0, 80) },
      '[humanize] retry requested'
    );
    return { kind: 'retry', score, hint: buildAntiPatternHint(detected) };
  }
  return { kind: 'reject', score, reason: `high-score:${detected.join(',')}` };
}

// ─── Layer 1 — Transform ───────────────────────────────────────────────────────

function transform(text: string): string {
  let t = text.trim();

  // Strip wrapping quotes/backticks/asterisks (Gemini occasionally wraps output)
  t = t.replace(/^["'`*\s]+|["'`*\s]+$/g, '');

  // Strip any remaining label preamble even though we ask the prompt to avoid them
  t = t.replace(
    /^(reason|love reason|thought|reflection|daily thought|here'?s? (a|one|your)?\s*(reason|reflection|thought))\s*:?\s*/i,
    ''
  );

  // Punctuation cleanup — em/en dashes and semicolons are the most common AI tells
  t = t.replace(/[—–]/g, ',');
  t = t.replace(/;/g, '.');
  t = t.replace(/\s*,\s*,\s*/g, ', '); // collapse comma sequences from dash replacement
  t = t.replace(/\.\s*\./g, '.'); // collapse period sequences
  t = t.replace(/!+/g, '!');
  t = t.replace(/\?!|!\?/g, '?');
  t = t.replace(/\s+([.,!?])/g, '$1'); // strip space before punctuation
  t = t.replace(/\s+/g, ' ').trim();

  // Smart quotes to straight quotes (consistent rendering on Android default fonts)
  t = t.replace(/[‘’]/g, "'");
  t = t.replace(/[“”]/g, '"');

  // Sentence-case the opener if the first character is a letter
  if (t.length > 0 && /[a-z]/.test(t[0])) {
    t = t[0].toUpperCase() + t.slice(1);
  }

  // Ensure a terminal period if the model dropped it (and the sentence doesn't
  // already end in ! or ?). This is purely cosmetic — a missing period reads
  // like an unfinished thought, which is the wrong vibe for a love reason.
  if (t.length > 0 && !/[.!?]$/.test(t)) {
    t += '.';
  }

  return t;
}

// ─── Layer 2 — Score ───────────────────────────────────────────────────────────

function scoreAITells(t: string): { score: number; detected: string[] } {
  let score = 0;
  const detected: string[] = [];

  // Greeting-card opener (+3) — the strongest AI signature. "Real love is X"
  // and similar are virtually never how a real person would start a sentence
  // about their partner. We treat this as the most reliable single tell.
  if (/^(real love|true love|love is just|love isn'?t|love is not)\b/i.test(t)) {
    score += 3;
    detected.push('greeting-card-opener');
  }

  // Hallmark dictionary (+3, single bump regardless of how many) — these
  // words are so strongly associated with cliched relationship writing that
  // any one of them is sufficient signal.
  if (/\b(soulmate|soul mate|ride or die|happily ever after)\b/i.test(t)) {
    score += 3;
    detected.push('hallmark-dictionary');
  }

  // Antithetical "X isn't Y, it's Z" structure (+2) — common AI cadence but
  // not always cliche. Soft penalty so a single instance doesn't auto-reject,
  // but multiple AI tells combined push it over the retry threshold.
  // The regex requires the negation AND a following "it's/they're" within
  // 60 chars to avoid false positives on natural usage like "Apologies
  // that aren't owned aren't apologies." (no "it's" follow-up → not matched).
  if (/\b(isn'?t|is not|aren'?t|are not)\b.{2,60}\b(it'?s|they'?re)\b/i.test(t)) {
    score += 2;
    detected.push('antithetical-structure');
  }

  // Coach vocabulary (+1 per pattern, capped at +2) — abstract relationship
  // nouns favored by motivational-coach writing. Bounded so a single
  // instance is forgivable.
  let coachHits = 0;
  if (/\bthe journey\b/i.test(t)) coachHits++;
  if (/\bthe foundation\b/i.test(t)) coachHits++;
  if (/\bthe chapter\b/i.test(t)) coachHits++;
  if (/\bthe work of love\b/i.test(t)) coachHits++;
  if (coachHits > 0) {
    score += Math.min(coachHits, 2);
    detected.push(`coach-vocab:${coachHits}`);
  }

  // Formal abstract nouns (+1 each, capped at +2)
  let formalHits = 0;
  if (/\bcommitment\b/i.test(t)) formalHits++;
  if (/\bperseverance\b/i.test(t)) formalHits++;
  if (/\bdedication\b/i.test(t)) formalHits++;
  if (formalHits > 0) {
    score += Math.min(formalHits, 2);
    detected.push(`formal-nouns:${formalHits}`);
  }

  // Trailing motivational adjective (+1) — "every single day", "always",
  // "forever" tacked on the end. Often survives Layer 1 because it doesn't
  // involve dashes/semicolons.
  if (/,?\s*(every single day|always|forever|no matter what)\.?$/i.test(t)) {
    score += 1;
    detected.push('trailing-motivational');
  }

  // Em-dashes survived Layer 1 (+1) — sanity check, shouldn't happen but if
  // the transform regex missed a Unicode variant we want to flag it.
  if (/[—–]/.test(t)) {
    score += 1;
    detected.push('em-dash-survived');
  }

  return { score, detected };
}

// ─── Layer 3 — Helpers ─────────────────────────────────────────────────────────

/**
 * Build a focused anti-pattern hint to inject into the retry prompt. We
 * deliberately tailor the hint to what we actually saw so Gemini's retry
 * has the right context — "your previous response did X, please don't do
 * X again". Generic hints get ignored; specific ones get followed.
 */
function buildAntiPatternHint(detected: string[]): string {
  const parts: string[] = [];

  if (detected.includes('greeting-card-opener')) {
    parts.push('Do NOT start with "Real love", "True love", "Love is", or "Love isn\'t".');
  }
  if (detected.includes('antithetical-structure')) {
    parts.push('Do NOT use the structure "X isn\'t Y, it\'s Z" or "X aren\'t Y, they\'re Z".');
  }
  if (detected.some((d) => d.startsWith('coach-vocab'))) {
    parts.push('Do NOT use phrases like "the journey", "the foundation", "the chapter", "the work of love".');
  }
  if (detected.some((d) => d.startsWith('formal-nouns'))) {
    parts.push('Do NOT use the words "commitment", "perseverance", or "dedication".');
  }
  if (detected.includes('hallmark-dictionary')) {
    parts.push('Do NOT use the words "soulmate", "ride or die", or "happily ever after".');
  }
  if (detected.includes('trailing-motivational')) {
    parts.push('Do NOT end with "every single day", "always", "forever", or "no matter what".');
  }

  // Fallback hint if somehow detected was empty but we still routed to retry
  if (parts.length === 0) {
    parts.push('Make it sound less like motivational writing — more like a real person texting.');
  }

  return parts.join(' ');
}

function containsAISelfReference(t: string): boolean {
  return /\b(as an ai|language model|i'?m an ai|i cannot|i don'?t have personal|i apologize, but|here is (a|the) (love reason|reflection))\b/i.test(
    t
  );
}

function isAllCaps(t: string): boolean {
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 5) return false;
  const upper = letters.replace(/[^A-Z]/g, '');
  return upper.length / letters.length > 0.5;
}
