/**
 * The admin People page (/crm) numbers, worked out from one grouped query.
 *
 * crm_people_breakdown() (migration 20261018090000) returns a count for each
 * lifecycle_status x exam_year x lifecycle_stage x engagement combination. The
 * page totals those here, so every number is exact and the cards cross-filter:
 * the activity cards count within the chosen stage, the stage cards within the
 * chosen activity, and both within the chosen season and Current/Archived view.
 * That way a card's number is what the table shows after clicking it (search
 * aside).
 */

import { activityGroupOf } from '@neram/database';
import type { ActivityGroup, LifecycleStage, PeopleBreakdownRow } from '@neram/database';

export type Season = 'current' | 'later' | 'earlier' | 'all';
export type PeopleView = 'active' | 'archived';

/** Card order on the page. Alumni and Archived show only when they have people. */
export const STAGE_ORDER: LifecycleStage[] = [
  'prospect',
  'lead',
  'applicant',
  'enrolled',
  'active_student',
  'paused',
  'alumni',
  'archived',
];

export const ACTIVITY_ORDER: ActivityGroup[] = ['recent', 'quiet', 'gone'];

/**
 * Inclusive exam_year bounds for ?season=. 'current' is the current batch's
 * exam year; an explicit year ('2027') is accepted too.
 */
export function seasonBounds(
  season: string | null | undefined,
  currentExamYear: number
): { examYearMin?: number; examYearMax?: number } {
  if (!season || season === 'all') return {};
  if (season === 'current') return { examYearMin: currentExamYear, examYearMax: currentExamYear };
  if (season === 'later') return { examYearMin: currentExamYear + 1 };
  if (season === 'earlier') return { examYearMax: currentExamYear - 1 };
  if (/^\d{4}$/.test(season)) return { examYearMin: Number(season), examYearMax: Number(season) };
  return {};
}

function inSeason(examYear: number | null, season: Season, currentExamYear: number): boolean {
  const { examYearMin, examYearMax } = seasonBounds(season, currentExamYear);
  if (examYearMin === undefined && examYearMax === undefined) return true;
  if (examYear === null) return false;
  if (examYearMin !== undefined && examYear < examYearMin) return false;
  if (examYearMax !== undefined && examYear > examYearMax) return false;
  return true;
}

export interface PeopleSelection {
  view: PeopleView;
  season: Season;
  currentExamYear: number;
  activity?: ActivityGroup | null;
  stage?: LifecycleStage | null;
}

export interface PeopleSummary {
  /** Leads and students in the list, by Current / Archived. */
  totals: { active: number; archived: number; all: number };
  /** People per season chip, within the chosen view. */
  seasons: Record<Season, number>;
  /** How many in the chosen view and season have an estimated exam year. */
  estimated: number;
  /** Activity cards: within view, season and the chosen stage. */
  activity: Record<ActivityGroup, number>;
  /** Stage cards: within view, season and the chosen activity. */
  stages: Record<LifecycleStage, number>;
  /** People matching every chosen filter; equals the table total without search. */
  matching: number;
}

export function summarisePeople(rows: PeopleBreakdownRow[], sel: PeopleSelection): PeopleSummary {
  const totals = { active: 0, archived: 0, all: 0 };
  const seasons: Record<Season, number> = { current: 0, later: 0, earlier: 0, all: 0 };
  const activity: Record<ActivityGroup, number> = { recent: 0, quiet: 0, gone: 0 };
  const stages = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<LifecycleStage, number>;
  let estimated = 0;
  let matching = 0;

  for (const r of rows) {
    const n = Number(r.n) || 0;
    const status = r.lifecycle_status === 'archived' ? 'archived' : 'active';
    totals[status] += n;
    totals.all += n;
    if (status !== sel.view) continue;

    for (const s of ['current', 'later', 'earlier', 'all'] as Season[]) {
      if (inSeason(r.exam_year, s, sel.currentExamYear)) seasons[s] += n;
    }
    if (!inSeason(r.exam_year, sel.season, sel.currentExamYear)) continue;

    if (r.exam_year_source === 'signup') estimated += n;

    const group = activityGroupOf(r.engagement);
    const stageOk = !sel.stage || r.lifecycle_stage === sel.stage;
    const activityOk = !sel.activity || group === sel.activity;

    if (stageOk) activity[group] += n;
    if (activityOk && r.lifecycle_stage in stages) stages[r.lifecycle_stage] += n;
    if (stageOk && activityOk) matching += n;
  }

  return { totals, seasons, estimated, activity, stages, matching };
}

/** Indian digit grouping, as staff read numbers (1,00,000). */
export function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}
