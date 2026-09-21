import { RSVP_REASONS, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * How the expected headcount is worded, in one place.
 *
 * Five surfaces render this number: the planner caption, the week block, the
 * month day list, the class panel and the availability sheet. One of them
 * wording it differently is exactly the drift the shared roster module exists
 * to end, and it is worse here than usual because the number has two
 * denominators behind it (see the route's own comment on why away leaves
 * `total` but never leaves the attendance rate).
 *
 * Type-only import, so nothing from the route reaches the browser bundle. Same
 * precedent as RegisterGrid importing RegisterResponse.
 */

/** "18 of 22 expected". Where there is room for the whole sentence. */
export function expectedLabel(s: RsvpSummary): string {
  return `${s.attending} of ${s.total} expected`;
}

/** "18 of 22". For a 116px week column, where there is not. */
export function compactLabel(s: RsvpSummary): string {
  return `${s.attending} of ${s.total}`;
}

/** "6 away", "1 away". Empty string at zero, so callers can concatenate. */
export function awayLabel(count: number): string {
  return count > 0 ? `${count} away` : '';
}

/** "4 stepped out". The existing vocabulary for a per-class opt-out. */
export function steppedOutLabel(count: number): string {
  return count > 0 ? `${count} stepped out` : '';
}

/** "28 on roll". The other denominator, spelled out so the two reconcile. */
export function onRollLabel(count: number): string {
  return `${count} on roll`;
}

/**
 * "24 of 28 available". The wording for a date with NO class scheduled.
 *
 * Deliberately not expectedLabel. On the default-attending model "expected"
 * means "has not said otherwise", and on a date with no class there is nothing
 * to say otherwise about: no RSVP row can exist, so `not_attending` is a
 * structural zero rather than a measured one. Printing "24 of 24 expected,
 * nobody stepped out" would assert a reply nobody was ever given the chance to
 * make. "Available" claims only what is true, that these students have not
 * declared themselves away.
 */
export function availableLabel(s: RsvpSummary): string {
  return `${s.attending} of ${s.on_roll} available`;
}

/** The other half of that honesty, for the caption under it. */
export const UNASKED_NOTE = 'Nothing scheduled yet, so nobody has been asked.';

export type TurnoutKey = 'good' | 'thin' | 'very_thin' | 'empty';

export interface Turnout {
  key: TurnoutKey;
  /** Short enough for a chip at 375px. */
  label: string;
}

/** At or above this share of the roll, the class is worth running as planned. */
export const TURNOUT_GOOD = 0.75;
/** Below this share, it is worth asking whether to run it at all. */
export const TURNOUT_THIN = 0.5;

/**
 * Is this day worth running?
 *
 * Measured against `on_roll`, NOT against `total`. This is the one number on
 * the screen that must not use the expected-headcount denominator: away
 * students leave `total`, so a night where 14 of 27 are on exam leave and the
 * remaining 13 all turn up reads as 13 of 13, a perfect 100%. That is precisely
 * the night the teacher opened this to find. Against the roll it reads 48%,
 * which is the truth they are deciding on.
 *
 * The verdict is a word, never a colour on its own: the chip that renders it
 * carries an icon and this label together, because half of "very thin" arriving
 * as a red pixel reaches neither a screen reader nor a colour-blind reader.
 */
export function turnoutVerdict(s: RsvpSummary): Turnout {
  if (s.on_roll <= 0) return { key: 'empty', label: 'Nobody on roll' };
  return verdictFor(s.attending, s.on_roll);
}

/**
 * The same verdict, read off the realistic headcount instead of the entitled one.
 *
 * Shares the thresholds with turnoutVerdict by construction rather than by
 * copying them, because a calendar cell saying "Thin" and the sheet behind it
 * saying "Good turnout" about the same night is the drift this file exists to
 * prevent.
 */
export function forecastVerdict(likely: number, onRoll: number): Turnout {
  if (onRoll <= 0) return { key: 'empty', label: 'Nobody on roll' };
  return verdictFor(likely, onRoll);
}

function verdictFor(head: number, onRoll: number): Turnout {
  const share = head / onRoll;
  if (share >= TURNOUT_GOOD) return { key: 'good', label: 'Good turnout' };
  if (share >= TURNOUT_THIN) return { key: 'thin', label: 'Thin' };
  return { key: 'very_thin', label: 'Very thin' };
}

/**
 * "2 exam clash, 1 unwell, 1 family", in the order the reasons are offered.
 *
 * This is the line that answers "why", which is what turns a count the teacher
 * cannot act on into one they can: nine students out on a school exam clash is
 * a class to move, nine out unwell is not. Empty string when nothing is
 * tallied, so callers can concatenate.
 */
export function reasonSummaryLabel(
  tally: Partial<Record<RsvpReasonCode, number>> | null | undefined,
): string {
  if (!tally) return '';
  return RSVP_REASONS.filter((r) => (tally[r.code] || 0) > 0)
    .map((r) => `${tally[r.code]} ${r.shortLabel.toLowerCase()}`)
    .join(', ');
}

/**
 * The whole thing as one sentence, for an aria-label.
 *
 * Several surfaces can only afford to show "18 of 22" or a bare icon. A screen
 * reader should still get the away count, because on those surfaces colour and
 * a 12px glyph are carrying it, and neither reaches a screen reader at all.
 */
export function announce(s: RsvpSummary): string {
  const parts = [expectedLabel(s), awayLabel(s.away), steppedOutLabel(s.not_attending)];
  return parts.filter(Boolean).join(', ');
}

// ── The realistic headcount ──────────────────────────────────────────────────
//
// Everything below words the forecast. It is kept in this file, beside the
// wording it has to sit next to, for the reason stated at the top: five
// surfaces render this number and the moment one of them phrases it itself the
// screens start disagreeing about the same night.

/** The shape the labels need. A structural subset of DayForecast. */
export interface ForecastLike {
  likely: number;
  expected: number;
  onRoll: number;
  away: number;
  declined: number;
  atRisk: number;
  estimated: boolean;
}

/**
 * "~16 of 30" on the calendar.
 *
 * The tilde is load-bearing and appears only when something was actually
 * discounted. "20 of 30" with nobody at risk is a count, not a prediction, and
 * decorating it as an estimate would teach the teacher to distrust the digits
 * on every other cell too.
 */
export function likelyLabel(f: ForecastLike): string {
  return `${f.estimated ? '~' : ''}${f.likely} of ${f.onRoll}`;
}

/** The same, spelled out, where there is room for a word. */
export function likelySentence(f: ForecastLike): string {
  return `${likelyLabel(f)} likely`;
}

/**
 * "30 on roll, 9 away, 1 stepped out, 4 rarely come".
 *
 * The sum behind the headline, in the order it is subtracted, so the teacher
 * can check the number rather than trust it. Zero terms are dropped: "0 stepped
 * out" is noise on the twenty-nine days a month where nobody did.
 */
export function forecastBreakdownLabel(f: ForecastLike): string {
  const parts = [
    onRollLabel(f.onRoll),
    awayLabel(f.away),
    steppedOutLabel(f.declined),
    f.atRisk > 0 ? `${f.atRisk} rarely come` : '',
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * "In 2 of the last 18 classes (11%)".
 *
 * States the real denominator it judged on. The founder asked for "their last
 * 10"; the measured window is a date range, so quoting a fixed ten would be a
 * number nobody could check against the register. `judged` already has declared
 * away days taken out of it, which is why this can be shown to a student's
 * teacher without misrepresenting anyone who told us in advance.
 */
export function attendanceRecordLabel(record: { judged: number; rate: number | null }): string {
  if (record.rate === null || record.judged <= 0) return 'No attendance measured yet';
  return `In ${Math.round((record.rate / 100) * record.judged)} of the last ${record.judged} classes (${record.rate}%)`;
}

/**
 * The forecast as one sentence, for a screen reader.
 *
 * The calendar cell carries the verdict as a colour and a 12px glyph and the
 * count as four characters. Neither survives the trip to a screen reader, so
 * the whole sum goes in the accessible name.
 */
export function announceForecast(f: ForecastLike, dayLabel: string, scheduled: boolean): string {
  const parts = [
    dayLabel,
    scheduled ? likelySentence(f) : `${likelyLabel(f)} available`,
    forecastVerdict(f.likely, f.onRoll).label,
    forecastBreakdownLabel(f),
  ];
  return parts.filter(Boolean).join(', ');
}

export interface AvailabilitySegment {
  key: 'attending' | 'at_risk' | 'declined' | 'away';
  /** Percentage of the full roll, 0 to 100. */
  pct: number;
}

/**
 * The bar, measured against `on_roll` rather than `total`.
 *
 * Deliberate: the bar is the one place both denominators are visible at once.
 * Measuring it against `total` would hide the away block entirely, which is the
 * single fact the teacher opened the sheet to see.
 */
export function barSegments(s: RsvpSummary, atRisk = 0): AvailabilitySegment[] {
  if (s.on_roll <= 0) return [];
  const pct = (n: number) => (n / s.on_roll) * 100;
  // Carved OUT of attending, not added beside it, so the solid block always
  // measures `likely` and the bar and the headline cannot disagree.
  const risky = Math.min(Math.max(atRisk, 0), s.attending);
  return [
    { key: 'attending' as const, pct: pct(s.attending - risky) },
    // Only when there is something to carve out. A zero-width block is DOM that
    // renders nothing, reads as nothing, and still has to be explained to every
    // test that counts the segments.
    ...(risky > 0 ? [{ key: 'at_risk' as const, pct: pct(risky) }] : []),
    { key: 'declined' as const, pct: pct(s.not_attending) },
    { key: 'away' as const, pct: pct(s.away) },
  ];
}
