/**
 * What has to be true before a batch of drawing reviews reaches students.
 *
 * Pure, so the rules can be read and tested without a database, the same way
 * the exam publish preflight is.
 *
 * The shape is borrowed from that flow deliberately: BLOCKERS disable the
 * button, WARNINGS do not. The difference is whether the teacher could be about
 * to do something they cannot take back. Fifty-eight Teams cards cannot be
 * recalled.
 *
 * One thing is deliberately NOT borrowed. An exam publishes once and is done.
 * Drawing reviews release in a rolling way: late joiners keep submitting an
 * assignment for weeks, so releasing means "hand back everything held right
 * now", repeatable, with no terminal published state.
 */

export interface ReleaseCounts {
  /** Reviews finished and waiting to go out. */
  held: number;
  /** Flagged sheets nobody has opened: blurry, blank, wrong brief, stalled redo. */
  flagged: number;
  /** Held reviews whose screen was never actually opened. */
  unopened: number;
  /** Students with no Teams address, who will get the Nexus bell only. */
  withoutTeamsEmail: number;
  /** Age of the oldest held review, in days. */
  oldestHeldDays: number;
}

export interface ReleasePreflight {
  blockers: string[];
  warnings: string[];
  canRelease: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildReleasePreflight(counts: ReleaseCounts): ReleasePreflight {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (counts.held <= 0) {
    blockers.push('Nothing is held for this assignment, so there is nothing to hand back.');
  }

  if (counts.flagged > 0) {
    blockers.push(
      `${plural(counts.flagged, 'flagged drawing has', 'flagged drawings have')} not been opened. ` +
        'Flagged work is never released without a person looking at it.',
    );
  }

  if (counts.unopened > 0) {
    warnings.push(
      `${plural(counts.unopened, 'review has', 'reviews have')} not been opened. ` +
        'Releasing now sends them unread.',
    );
  }

  if (counts.withoutTeamsEmail > 0) {
    warnings.push(
      `${plural(counts.withoutTeamsEmail, 'student has', 'students have')} no Teams address, ` +
        'so they get the Nexus bell only.',
    );
  }

  // Two days is the point at which a held review stops being "in progress" and
  // starts being a student wondering whether anyone looked at their work.
  if (counts.oldestHeldDays >= 2) {
    warnings.push(
      `The oldest of these has been waiting ${plural(counts.oldestHeldDays, 'day', 'days')}.`,
    );
  }

  return { blockers, warnings, canRelease: blockers.length === 0 };
}

/** The one line above the button, saying exactly what is about to happen. */
export function releaseSummary(count: number): string {
  if (count <= 0) return 'Nothing to hand back yet.';
  return `${plural(count, 'drawing', 'drawings')} will be handed back now.`;
}
