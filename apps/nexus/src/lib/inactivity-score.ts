/**
 * Cross-signal student inactivity scoring.
 *
 * A teacher looking at one assignment page cannot tell the difference between
 * "missed this one" and "has done nothing for six weeks". This module combines
 * every signal we actually have into one score and tier, so the genuinely
 * disengaged students rise to the top of a single list.
 *
 * PURE TypeScript (no JSX, no Supabase, no Date.now) so the same rules run on
 * the server and in unit tests. `today` is injected for the same reason.
 *
 * ---------------------------------------------------------------------------
 * RSVP IS NOT A SIGNAL, AND MUST NEVER BE CLAIMED AS ONE.
 *
 * nexus_class_rsvp stores ONLY opt-outs, and deletes the row when a student
 * opts back in. There is deliberately no "no response" state: a student who
 * never touches the RSVP is treated as attending. So "never responded to a
 * meeting invite" is unrepresentable in the current data model, and any UI that
 * claimed it would be inventing evidence.
 *
 * What we CAN honestly say is "missed the class", from nexus_class_absences
 * where kind = 'no_show'.
 * ---------------------------------------------------------------------------
 *
 * The most dangerous failure mode, guarded explicitly below: absences are
 * derived as roster-minus-attendance, and attendance sync runs on a DELEGATED
 * Microsoft token, so the nightly cron cannot refresh it (see the KNOWN LIMIT
 * note in api/cron/class-followups). A class whose attendance was never synced
 * therefore looks like the ENTIRE roster was absent. The caller must only count
 * absences over classes that actually have attendance data, and pass
 * `absences: null` otherwise. Null means "not measured", never "attended".
 */

export type InactivityTier = 'new' | 'ok' | 'nudge' | 'watch' | 'critical';

/** A student enrolled less recently than this is judged on the full rules. */
export const NEW_JOINER_GRACE_DAYS = 14;

export interface InactivitySignals {
  /** ISO timestamp of enrollment. Drives the new-joiner grace period only. */
  enrolledAt: string | null;
  /** Today as YYYY-MM-DD or an ISO timestamp. Injected to keep this pure. */
  today: string;
  /**
   * From getAssignmentEngagement. null when the classroom has no published
   * work yet, in which case a student cannot be blamed for submitting nothing.
   */
  assignments: {
    applicable: number;
    submitted: number;
    daysSinceLast: number | null;
  } | null;
  /**
   * no_show rows counted ONLY over classes that have attendance data.
   * null when no class in the window has any attendance rows at all.
   */
  absences: {
    noShows: number;
    classesMeasured: number;
  } | null;
  login: {
    firstLoginAt: string | null;
    lastLoginAt: string | null;
  };
  photoStatus: 'missing' | 'pending' | 'approved' | 'rejected';
}

export interface InactivityResult {
  score: number;
  tier: InactivityTier;
  /** Short human strings for the UI chips, worst first. */
  reasons: string[];
  /** Never opened Nexus AND never submitted anything. The strongest signal. */
  neverEngaged: boolean;
  /** Signals we could not measure, e.g. ['attendance']. Rendered as "not measured". */
  unavailable: string[];
}

/** Whole days between two dates, or null if either is unparseable. */
function daysBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

export function scoreInactivity(s: InactivitySignals): InactivityResult {
  const reasons: string[] = [];
  const unavailable: string[] = [];

  // New joiners get a clean slate. A student who enrolled last week has not had
  // time to submit anything, and flagging them teaches the teacher to ignore
  // the list.
  const daysEnrolled = daysBetween(s.enrolledAt, s.today);
  if (daysEnrolled !== null && daysEnrolled < NEW_JOINER_GRACE_DAYS) {
    return {
      score: 0,
      tier: 'new',
      reasons: ['Joined recently'],
      neverEngaged: false,
      unavailable: s.absences === null ? ['attendance'] : [],
    };
  }

  let score = 0;

  // Assignments. Highest matching band only, so one axis cannot stack.
  const a = s.assignments;
  const neverSubmitted = !!a && a.applicable >= 2 && a.submitted === 0;
  if (a) {
    if (neverSubmitted) {
      score += 3;
      reasons.push('No assignment ever submitted');
    } else if (a.daysSinceLast !== null && a.daysSinceLast > 21) {
      score += 2;
      reasons.push('No assignment in 3 weeks');
    } else if (a.daysSinceLast !== null && a.daysSinceLast > 14) {
      score += 1;
      reasons.push('No assignment in 2 weeks');
    }
  }

  // Absences. The ratio bands need a real denominator: with only 2 measured
  // classes, "missed both" is noise, not a pattern, so it only reaches the
  // flat band.
  if (s.absences === null) {
    unavailable.push('attendance');
  } else {
    const { noShows, classesMeasured } = s.absences;
    const ratio = classesMeasured > 0 ? noShows / classesMeasured : 0;
    if (classesMeasured >= 4 && ratio >= 0.75) {
      score += 3;
      reasons.push('Missed almost every class');
    } else if (classesMeasured >= 4 && ratio >= 0.5) {
      score += 2;
      reasons.push('Missed half the classes');
    } else if (noShows >= 2) {
      score += 1;
      reasons.push('Missed some classes');
    }
  }

  // Login.
  const neverLoggedIn = !s.login.firstLoginAt;
  if (neverLoggedIn) {
    score += 3;
    reasons.push('Never opened Nexus');
  } else {
    const sinceLogin = daysBetween(s.login.lastLoginAt, s.today);
    if (sinceLogin !== null && sinceLogin > 21) {
      score += 2;
      reasons.push('Not opened in 3 weeks');
    } else if (sinceLogin !== null && sinceLogin > 14) {
      score += 1;
      reasons.push('Not opened in 2 weeks');
    }
  }

  // Photo. A weak signal on its own, but a student with no photo who also does
  // not submit and does not log in is a clear pattern.
  if (s.photoStatus === 'missing') {
    score += 1;
    reasons.push('No profile photo');
  }

  // Never opened Nexus AND never submitted anything is the strongest evidence
  // we have that a student is not really in the class, so it overrides the
  // arithmetic rather than depending on it.
  const neverEngaged = neverLoggedIn && (!a || a.submitted === 0);

  let tier: InactivityTier;
  if (neverEngaged) tier = 'critical';
  else if (score >= 6) tier = 'critical';
  else if (score >= 3) tier = 'watch';
  else if (score >= 1) tier = 'nudge';
  else tier = 'ok';

  return { score, tier, reasons, neverEngaged, unavailable };
}

/** Display order and colour for the tier chips. Worst first. */
export const TIER_ORDER: InactivityTier[] = ['critical', 'watch', 'nudge', 'ok', 'new'];

export const TIER_LABEL: Record<InactivityTier, string> = {
  critical: 'Critical',
  watch: 'Watch',
  nudge: 'Nudge',
  ok: 'OK',
  new: 'New',
};

export const TIER_COLOR: Record<InactivityTier, string> = {
  critical: '#C62828',
  watch: '#B8860B',
  nudge: '#1565C0',
  ok: '#2E7D32',
  new: '#6B7280',
};
