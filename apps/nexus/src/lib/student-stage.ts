/**
 * Study stage and participation tokens: labels, colours, icons and the segment
 * rules for the students screen.
 *
 * Two orthogonal axes, deliberately never collapsed into one:
 *
 *   stage    WHERE a student is in their studies. Break Year | Class 12 |
 *            Class 11 | Class 10 | Not set. Drives priority.
 *   dormant  WHETHER they are still engaging. Drives whether they are counted.
 *
 * A student can be Class 11 AND dormant. That is why `matchesSegment` takes
 * both and why the UI renders two chips rather than one.
 *
 * This module is PURE TypeScript: no JSX, no DB access, no next/* imports, and a
 * type-only import from @neram/database that is erased at compile time. Exactly
 * like staff-capabilities.ts and feature-flags.ts. Being importable from both
 * sides is the whole point: the server computes the segment counts and the
 * client filters the rows using THE SAME functions, so the header count and the
 * list length cannot disagree.
 *
 * Shape follows inactivity-score.ts (TIER_ORDER / TIER_LABEL / TIER_COLOR).
 */

import type { NexusStudyStage } from '@neram/database';

/** The stage as the UI thinks of it: the four DB values plus the absence of one. */
export type StageKey = 'gap_year' | '12th' | '11th' | '10th' | 'unset';

/** Priority order, highest first. Drives group ordering and the drawer's options. */
export const STAGE_ORDER: readonly StageKey[] = ['gap_year', '12th', '11th', '10th', 'unset'];

/** Only the four settable values, for pickers. `unset` is cleared, not chosen. */
export const SETTABLE_STAGES: readonly NexusStudyStage[] = ['gap_year', '12th', '11th', '10th'];

export const STAGE_LABEL: Record<StageKey, string> = {
  gap_year: 'Break Year',
  '12th': 'Class 12',
  '11th': 'Class 11',
  '10th': 'Class 10',
  unset: 'Not set',
};

/** One line explaining what the stage means, shown under each drawer option. */
export const STAGE_MEANING: Record<StageKey, string> = {
  gap_year: 'Finished Class 12, preparing full time. Exam this year.',
  '12th': 'Currently in Class 12. Exam this year.',
  '11th': 'Currently in Class 11. Exam next year.',
  '10th': 'Currently in Class 10.',
  unset: 'Nobody has recorded a study stage yet.',
};

export const STAGE_TOOLTIP: Record<StageKey, string> = {
  gap_year: 'Break Year: finished Class 12 and preparing full time. Their exam is this year.',
  '12th': 'Class 12: their exam is this year.',
  '11th': 'Class 11: their exam is next year.',
  '10th': 'Class 10.',
  unset: 'No study stage recorded yet. A manager can set it from the students list.',
};

/**
 * Explicit hexes, never <Chip color="...">.
 *
 * The MuiChip overrides in packages/ui/src/theme/theme.ts resolve against the
 * BASE semanticColors, not the Nexus palette in variants.ts, so <Chip
 * color="success"> paints #2E7D32 while theme.palette.success.main is #16A34A.
 * Every chip here uses bgcolor: alpha(HEX, 0.14) / color: HEX instead, matching
 * the watchlist tier chips. Do not "simplify" this to a color prop.
 */
export const STAGE_COLOR: Record<StageKey, string> = {
  gap_year: '#C2410C', // orange-700, highest priority
  '12th': '#B45309', // amber-700, same "exam this year" group
  '11th': '#1D4ED8', // blue-700, exam next year
  '10th': '#0F766E', // teal-700, lower grade
  unset: '#6B7280', // grey-500
};

/**
 * 400-weight tones for dark mode. The 700-weight hexes at 14% alpha lose
 * contrast on a dark background.paper, and this lands on about a dozen surfaces
 * rather than the watchlist's one, so it ships from the start.
 */
export const STAGE_COLOR_DARK: Record<StageKey, string> = {
  gap_year: '#FB923C',
  '12th': '#FBBF24',
  '11th': '#60A5FA',
  '10th': '#2DD4BF',
  unset: '#9CA3AF',
};

/**
 * Icon KEYS, not components, so this module stays JSX-free and importable from
 * the server. The mapping key -> MUI icon lives in StageGlyph.tsx.
 */
export type StageIconKey = 'bolt' | 'flag' | 'schedule' | 'school' | 'help';

export const STAGE_ICON: Record<StageKey, StageIconKey> = {
  gap_year: 'bolt',
  '12th': 'flag',
  '11th': 'schedule',
  '10th': 'school',
  unset: 'help',
};

/**
 * Ring style. Dotted for "nobody has said" versus dashed for "paused" keeps the
 * two greys tellable apart at a glance.
 */
export const STAGE_RING_STYLE: Record<StageKey, 'solid' | 'dotted'> = {
  gap_year: 'solid',
  '12th': 'solid',
  '11th': 'solid',
  '10th': 'solid',
  unset: 'dotted',
};

/** The derived super-category. Never stored, always computed from the stage. */
export type StageGroup = 'exam_this_year' | 'exam_next_year' | 'lower' | 'unset';

export const STAGE_GROUP: Record<StageKey, StageGroup> = {
  gap_year: 'exam_this_year',
  '12th': 'exam_this_year',
  '11th': 'exam_next_year',
  '10th': 'lower',
  unset: 'unset',
};

// ── Dormant ─────────────────────────────────────────────────────────────────

export const DORMANT_COLOR = '#94A3B8';
export const DORMANT_COLOR_DARK = '#94A3B8';
export const DORMANT_LABEL = 'Dormant';

/**
 * ONE source of truth for what dormant actually does. The tooltip, the confirm
 * drawer and the empty states all render this string, so they cannot drift apart
 * and quietly start promising different things.
 */
export const DORMANT_EXPLAINER =
  'Still enrolled. Keeps Nexus access, Teams invites and class notifications. ' +
  'Removed from attendance %, submission rates, prep readiness, the watchlist, ' +
  'checklist progress, leaderboards and every automatic reminder.';

/** One-tap reason presets for the drawer. Free text is still allowed. */
export const DORMANT_REASON_PRESETS: readonly string[] = [
  'Stopped attending',
  'Paused for board exams',
  'Family reason',
];

// ── Segments (the filter bar) ───────────────────────────────────────────────

export type StudentSegment =
  | 'exam_this_year'
  | 'all_active'
  | '11th'
  | 'lower'
  | 'unset'
  | 'dormant';

export const SEGMENT_ORDER: readonly StudentSegment[] = [
  'exam_this_year',
  'all_active',
  '11th',
  'lower',
  'unset',
  'dormant',
];

export const SEGMENT_LABEL: Record<StudentSegment, string> = {
  exam_this_year: 'Exam this year',
  all_active: 'All active',
  '11th': 'Class 11',
  lower: 'Lower',
  unset: 'Not set',
  dormant: 'Dormant',
};

export const SEGMENT_TOOLTIP: Record<StudentSegment, string> = {
  exam_this_year: 'Break Year and Class 12: the students sitting the exam this year.',
  all_active: 'Every student still participating, whatever their stage.',
  '11th': 'Class 11: they sit the exam next year.',
  lower: 'Class 10 and below.',
  unset: 'No study stage recorded yet. These cannot be prioritised or targeted.',
  dormant: 'Enrolled but not participating. Excluded from every metric and reminder.',
};

/**
 * The landing segment. Opening straight onto the students who sit the exam this
 * year makes the priority the default daily experience instead of something a
 * teacher has to remember to filter for.
 */
export const DEFAULT_SEGMENT: StudentSegment = 'exam_this_year';

export const SEGMENT_STORAGE_KEY = 'nexus:students:segment';

// ── Exam year (users.academic_year) ─────────────────────────────────────────

/**
 * The class and the exam year are two INDEPENDENT fields. Nothing derives one
 * from the other, because a repeater or an early attempt is legitimate. What the
 * app does instead is name the expected pairing and flag a disagreement, which is
 * what `pairStatus` in @neram/database computes and the API returns per student.
 *
 * The reason this matters: the public apply form's "Planning to Write Exam In"
 * answer never reached the database (Number('2026-27') is NaN), so a fallback
 * stamped every applicant with the CURRENT cohort regardless of their class. Three
 * Class 11 students were tagged as sitting the exam this year.
 */
export const EXAM_YEAR_LABEL = 'Exam year';

export const EXAM_YEAR_HELP =
  'Which cohort sits the exam. 2027-28 means the exam is written in 2028.';

/**
 * Setting this writes users.academic_year, which is per-user rather than
 * per-enrolment. Staff have to be told that, or a change made on a teacher screen
 * silently reappears in the admin CRM.
 */
export const EXAM_YEAR_SCOPE_WARNING =
  'Exam year applies everywhere, including the admin CRM, not just this classroom.';

/** Amber, matching the "needs a look" register rather than a hard error. */
export const PAIR_MISMATCH_COLOR = '#B45309';
export const PAIR_MISMATCH_COLOR_DARK = '#FBBF24';

export function pairMismatchColor(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? PAIR_MISMATCH_COLOR_DARK : PAIR_MISMATCH_COLOR;
}

/** '2027-28' -> 2028, the calendar year the cohort sits the exam. */
export function examYearOf(academicYear: string | null | undefined): number | null {
  const match = /^([0-9]{4})-[0-9]{2}$/.exec(academicYear || '');
  return match ? Number(match[1]) + 1 : null;
}

/** Accessible, self-explanatory text for a bare 'YYYY-YY' code. */
export function examYearDescription(academicYear: string | null | undefined): string {
  const year = examYearOf(academicYear);
  return year === null
    ? 'No exam year set'
    : `Exam year ${academicYear}, writes the exam in ${year}`;
}

/**
 * What the amber year pill says when the pair disagrees. `expected` comes from
 * expectedYearForStage on the server, so the copy always names a real fix.
 */
export function pairMismatchTooltip(
  stageLabel: string,
  stored: string | null | undefined,
  expected: string | null | undefined,
): string {
  if (!expected) return `${stageLabel} does not usually sit the exam in ${stored}.`;
  return `${stageLabel} normally sits the exam in ${expected}, not ${stored}. Check with the student, then correct whichever field is wrong.`;
}

// ── Functions ───────────────────────────────────────────────────────────────

export interface StageFacts {
  stage: StageKey;
  dormant: boolean;
}

/** Normalise a raw DB value. Anything unrecognised, including null, is `unset`. */
export function stageKeyOf(currentStandard: string | null | undefined): StageKey {
  switch (currentStandard) {
    case 'gap_year':
    case '12th':
    case '11th':
    case '10th':
      return currentStandard;
    default:
      return 'unset';
  }
}

/** True when this stage sits the exam in the current cycle. */
export function isExamThisYear(stage: StageKey): boolean {
  return STAGE_GROUP[stage] === 'exam_this_year';
}

/**
 * Does this student belong in this segment?
 *
 * The invariant that matters: a dormant student matches ONLY `dormant`. They are
 * never mixed back into a stage segment, because the whole point is that they
 * stop competing for a teacher's attention.
 */
export function matchesSegment(facts: StageFacts, segment: StudentSegment): boolean {
  if (segment === 'dormant') return facts.dormant;
  if (facts.dormant) return false;

  switch (segment) {
    case 'exam_this_year':
      return isExamThisYear(facts.stage);
    case 'all_active':
      return true;
    case '11th':
      return facts.stage === '11th';
    case 'lower':
      return facts.stage === '10th';
    case 'unset':
      return facts.stage === 'unset';
    default:
      return false;
  }
}

/** Count per segment. Note `all_active` overlaps the others by design. */
export function segmentCounts(rows: StageFacts[]): Record<StudentSegment, number> {
  const counts = {
    exam_this_year: 0,
    all_active: 0,
    '11th': 0,
    lower: 0,
    unset: 0,
    dormant: 0,
  } as Record<StudentSegment, number>;
  for (const row of rows) {
    for (const segment of SEGMENT_ORDER) {
      if (matchesSegment(row, segment)) counts[segment] += 1;
    }
  }
  return counts;
}

/** Count per stage, dormant students included under their own stage. */
export function stageCounts(rows: StageFacts[]): Record<StageKey, number> {
  const counts = { gap_year: 0, '12th': 0, '11th': 0, '10th': 0, unset: 0 } as Record<
    StageKey,
    number
  >;
  for (const row of rows) counts[row.stage] += 1;
  return counts;
}

/** Resolve the palette entry for the current theme mode. */
export function stageColor(stage: StageKey, mode: 'light' | 'dark'): string {
  return mode === 'dark' ? STAGE_COLOR_DARK[stage] : STAGE_COLOR[stage];
}

export function dormantColor(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? DORMANT_COLOR_DARK : DORMANT_COLOR;
}
