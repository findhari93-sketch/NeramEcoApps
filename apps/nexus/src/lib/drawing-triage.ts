/**
 * Which drawings a teacher can move through quickly, and which need them.
 *
 * Rules, not confidences. Nothing here asks a model anything: every reason is
 * computable from the photo's measured quality, the attempt count and the
 * student's own recent scores. When an AI draft exists later, its confidence
 * can narrow LOOKS ROUTINE further, but it can never widen it, because the two
 * non-negotiables below are rules:
 *
 *  - a redo is never routine, and
 *  - a low recent score is never routine.
 *
 * Every drawing carries a sentence saying why it landed where it did. Never a
 * bare number: "Needs a look" with no reason teaches a teacher to ignore it.
 *
 * LOOKS ROUTINE means "safe to review fast", never "safe to send unread".
 * Nothing has read a routine sheet yet, so it opens the fast lane, not a
 * release.
 */

import type { ImageQuality } from './image-quality';

export type TriageBand = 'routine' | 'needs_look' | 'flagged';

export type TriageReasonCode =
  | 'blank_sheet'
  | 'unreadable_photo'
  | 'no_improvement'
  | 'redo_attempt'
  | 'low_recent_score'
  | 'uneven_recent_scores'
  | 'little_history'
  | 'soft_photo'
  | 'dark_photo'
  | 'not_measured';

export interface TriageReason {
  code: TriageReasonCode;
  band: Exclude<TriageBand, 'routine'>;
  sentence: string;
}

export interface TriageInput {
  /** Attempts this student has made on this assignment, this one included. */
  attemptCount: number;
  quality: ImageQuality | null;
  /** Ratings given to this student's EARLIER attempts on this assignment, oldest first. */
  threadRatings: number[];
  /** This student's most recent ratings on other reviewed drawings, newest first. */
  recentRatings: number[];
}

export interface Triage {
  band: TriageBand;
  reasons: TriageReason[];
  /** One or two plain sentences. Always present, whatever the band. */
  explainer: string;
}

/**
 * Photo limits, calibrated on 80 real sheets from prod (2026-09-13).
 *
 * The faintest real drawing measured ink 0.0198; empty paper cropped from the
 * same photos measured 0.001 or less, so BLANK sits between with room either
 * side. No real sheet was unreadable: the softest (sharpness 40) and darkest
 * (brightness 95) were both perfectly judgeable. So soft and dark only ask for
 * a look, and only below anything actually seen.
 */
export const QUALITY_LIMITS = {
  blankInk: 0.005,
  unreadableSharpness: 15,
  softSharpness: 30,
  darkBrightness: 80,
} as const;

/** A score at or below this is never routine. */
export const LOW_SCORE = 2;
/** Recent scores used to judge whether this student is steady. */
export const RECENT_WINDOW = 3;

export const BAND_LABEL: Record<TriageBand, string> = {
  routine: 'Looks routine',
  needs_look: 'Needs a look',
  flagged: 'Flagged',
};

export function triageDrawing(input: TriageInput): Triage {
  const reasons: TriageReason[] = [];
  const { quality, attemptCount } = input;
  const recent = input.recentRatings.slice(0, RECENT_WINDOW);

  // Photo
  if (!quality) {
    reasons.push({ code: 'not_measured', band: 'needs_look', sentence: 'Photo not checked yet.' });
  } else if (quality.ink < QUALITY_LIMITS.blankInk) {
    reasons.push({ code: 'blank_sheet', band: 'flagged', sentence: 'The photo looks like a blank sheet.' });
  } else {
    if (quality.sharpness < QUALITY_LIMITS.unreadableSharpness) {
      reasons.push({ code: 'unreadable_photo', band: 'flagged', sentence: 'The photo is too blurred to judge the lines.' });
    } else if (quality.sharpness < QUALITY_LIMITS.softSharpness) {
      reasons.push({ code: 'soft_photo', band: 'needs_look', sentence: 'The photo is soft, so check the lines are readable.' });
    }
    if (quality.brightness < QUALITY_LIMITS.darkBrightness) {
      reasons.push({ code: 'dark_photo', band: 'needs_look', sentence: 'The photo is dark, so line weight may be hard to read.' });
    }
  }

  // Attempts
  const lastTwo = input.threadRatings.slice(-2);
  if (attemptCount >= 3 && lastTwo.length === 2 && lastTwo[1] <= lastTwo[0]) {
    reasons.push({
      code: 'no_improvement',
      band: 'flagged',
      sentence: `Attempt ${attemptCount}, and the last redo scored no higher than the one before (${lastTwo[0]} then ${lastTwo[1]}).`,
    });
  } else if (attemptCount >= 2) {
    reasons.push({ code: 'redo_attempt', band: 'needs_look', sentence: `Attempt ${attemptCount}, sent back after a redo.` });
  }

  // Recent scores
  if (recent.length > 0) {
    const low = Math.min(...recent);
    const high = Math.max(...recent);
    if (low <= LOW_SCORE) {
      reasons.push({
        code: 'low_recent_score',
        band: 'needs_look',
        sentence: recent.length === 1
          ? `Scored ${low} of 5 in their last review.`
          : `Scored ${low} of 5 in their last ${recent.length} reviews.`,
      });
    } else if (high - low > 1) {
      reasons.push({ code: 'uneven_recent_scores', band: 'needs_look', sentence: `Recent scores swing from ${low} to ${high}.` });
    }
  }
  if (recent.length < 2) {
    reasons.push({
      code: 'little_history',
      band: 'needs_look',
      sentence: recent.length === 0 ? 'No earlier reviews to compare against.' : 'Only one earlier review to compare against.',
    });
  }

  const band: TriageBand = reasons.some((r) => r.band === 'flagged')
    ? 'flagged'
    : reasons.length > 0
      ? 'needs_look'
      : 'routine';

  return { band, reasons, explainer: explain(band, reasons, recent) };
}

function explain(band: TriageBand, reasons: TriageReason[], recent: number[]): string {
  if (band === 'routine') {
    const low = Math.min(...recent);
    const high = Math.max(...recent);
    const range = low === high ? `all ${low}` : `${low} to ${high}`;
    return `First attempt, clear photo, last ${recent.length} scores within one band (${range}).`;
  }
  // Flagged reasons lead; two sentences is enough to decide whether to open it.
  const ordered = [...reasons.filter((r) => r.band === 'flagged'), ...reasons.filter((r) => r.band !== 'flagged')];
  return ordered.slice(0, 2).map((r) => r.sentence).join(' ');
}

const BAND_RANK: Record<TriageBand, number> = { flagged: 0, needs_look: 1, routine: 2 };

/** Flagged first, then needs a look, then routine; oldest submission first within a band. */
export function triageOrder<T extends { band: TriageBand; submittedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => BAND_RANK[a.band] - BAND_RANK[b.band] || a.submittedAt.localeCompare(b.submittedAt));
}

export function bandCounts(items: Array<{ band: TriageBand }>): Record<TriageBand, number> {
  const counts: Record<TriageBand, number> = { routine: 0, needs_look: 0, flagged: 0 };
  for (const item of items) counts[item.band] += 1;
  return counts;
}

/** FNV-1a, 32 bit. Stable across runtimes, which is all a sampler needs. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The sheets to read before trusting a batch of drafts.
 *
 * Deterministic for a given seed (the release batch id), so refreshing the page
 * never reshuffles which five the teacher was asked to read.
 */
export function pickSpotCheck(ids: string[], seed: string, count = 5): string[] {
  return Array.from(new Set(ids))
    .map((id) => ({ id, key: hash(`${seed}:${id}`) }))
    .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
    .slice(0, count)
    .map((x) => x.id);
}
