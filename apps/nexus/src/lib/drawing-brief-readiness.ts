/**
 * Is a brief type ready to be switched on, and if not, what is left.
 *
 * Two things, from two different places, and both must be complete:
 *
 *  - band wording for every criterion, all five bands, in the teacher's words;
 *  - an active anchor sheet for each of the five bands.
 *
 * Progress is a count a person can finish ("18 of 25 bands written"), because
 * an invisible writing task never gets done. The blockers are sentences, shown
 * as they are and returned by the activation route when it refuses.
 */

import { placeholderBands, type BandMap } from './drawing-eval/seed-criteria';

export interface ReadinessCriterion {
  key: string;
  title: string;
  band_descriptions: Partial<Record<string, string>> | null;
}

export interface BriefReadiness {
  bandsWritten: number;
  bandsTotal: number;
  anchorsSet: number;
  missingAnchorBands: number[];
  blockers: string[];
  ready: boolean;
}

const BANDS = [1, 2, 3, 4, 5] as const;

export function briefReadiness(criteria: ReadinessCriterion[], anchorBands: number[]): BriefReadiness {
  const blockers: string[] = [];
  let written = 0;

  if (criteria.length === 0) blockers.push('No criteria are defined for this brief type.');

  for (const c of criteria) {
    const missing = placeholderBands((c.band_descriptions ?? {}) as BandMap);
    written += 5 - missing.length;
    if (missing.length > 0) {
      blockers.push(
        missing.length === 5
          ? `${c.title}: no bands written yet.`
          : `${c.title}: band ${missing.join(', ')} still ${missing.length === 1 ? 'needs' : 'need'} wording.`,
      );
    }
  }

  const set = new Set(anchorBands.filter((b) => Number.isInteger(b) && b >= 1 && b <= 5));
  const missingAnchorBands = BANDS.filter((b) => !set.has(b));
  if (missingAnchorBands.length > 0) {
    blockers.push(
      `Reference sheets are set for ${set.size} of 5 bands. Band ${missingAnchorBands.join(', ')} still ${missingAnchorBands.length === 1 ? 'needs' : 'need'} one.`,
    );
  }

  return {
    bandsWritten: written,
    bandsTotal: criteria.length * 5,
    anchorsSet: set.size,
    missingAnchorBands: [...missingAnchorBands],
    blockers,
    ready: blockers.length === 0,
  };
}

export const MAX_BAND_TEXT = 600;

/** Band wording off the wire: only 1 to 5, trimmed, bounded. Null when malformed. */
export function parseBandDescriptions(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!['1', '2', '3', '4', '5'].includes(key)) return null;
    if (value == null) continue;
    if (typeof value !== 'string') return null;
    const text = value.trim().replace(/[ \t]+/g, ' ');
    if (text.length > MAX_BAND_TEXT) return null;
    if (text) out[key] = text;
  }
  return out;
}
