/**
 * How each student is actually working through each catch-up recap.
 *
 * The catch-up rules only need yes/no facts (watched, handed in, passed), and
 * that is all `loadClassFactsForStudents` reads. A teacher asking "why is this
 * student behind" needs the texture underneath: how far in they got, on how
 * many different days, whether a checkpoint keeps beating them, and when they
 * last touched it. This reads that, batched for the whole cohort.
 *
 * Four queries whatever the cohort size, all `.in()` over recap or test ids and
 * filtered to the students on screen:
 *   1. the recaps' lengths and sections (to turn seconds into a percentage and
 *      checkpoint attempts into "which section"),
 *   2. recap progress rows (furthest point, last heartbeat, started),
 *   3. per-day activity (sittings; only exists from 2026-10 onwards),
 *   4. checkpoint attempts, and 5. class-test attempts for the tests in play.
 *
 * Every read degrades to "unknown" rather than failing the screen: this is
 * explanation, not the rule. A missing activity-day table (a drifted
 * environment) reads as "no day history", which the diagnosis says out loud.
 */

import { isMissingTable } from './away-windows';

const CHUNK = 200;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function selectIn(
  supabase: any,
  table: string,
  columns: string,
  column: string,
  values: string[],
  refine?: (q: any) => any,
): Promise<{ rows: any[]; missing: boolean }> {
  if (values.length === 0) return { rows: [], missing: false };
  const results = await Promise.all(
    chunks(values).map((group) => {
      const base = supabase.from(table).select(columns).in(column, group);
      return refine ? refine(base) : base;
    }),
  );
  let missing = false;
  const rows: any[] = [];
  for (const r of results as any[]) {
    if (r?.error) {
      if (isMissingTable(r.error)) {
        missing = true;
        continue;
      }
      throw r.error;
    }
    rows.push(...(r?.data || []));
  }
  return { rows, missing };
}

export interface RecapActivity {
  /** 0 to 100, or null when the recap's length is unknown. */
  watchedPct: number | null;
  startedAt: string | null;
  /** Latest of the heartbeat, a checkpoint try, or an active day. */
  lastActiveAt: string | null;
  completed: boolean;
  /** Distinct days with any activity. Null when no day history exists for it. */
  activeDays: number | null;
  /** The worst section: most failed tries without a pass since. */
  checkpoint: { sectionNo: number; fails: number } | null;
}

export interface TestActivity {
  attempts: number;
  lastPct: number | null;
  bestPct: number | null;
}

export interface CatchupActivity {
  /** Keyed `${recapId}:${studentId}`. */
  recap: Map<string, RecapActivity>;
  /** Keyed `${testId}:${studentId}`. */
  test: Map<string, TestActivity>;
  /** False when the day table is not there yet, so "sittings" cannot be said. */
  dayHistory: boolean;
}

const k = (a: string, b: string) => `${a}:${b}`;

const later = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : a > b ? a : b;

export async function loadCatchupActivity(
  supabase: any,
  opts: { recapIds: string[]; testIds: string[]; studentIds: string[] },
): Promise<CatchupActivity> {
  const { recapIds, testIds, studentIds } = opts;
  const empty: CatchupActivity = { recap: new Map(), test: new Map(), dayHistory: true };
  if (studentIds.length === 0) return empty;

  const byStudents = (q: any) => q.in('student_id', studentIds);

  const [recaps, sections, progress, days, tests] = await Promise.all([
    selectIn(supabase, 'nexus_class_recaps', 'id, video_duration_seconds', 'id', recapIds),
    selectIn(supabase, 'nexus_class_recap_sections', 'id, recap_id, sort_order', 'recap_id', recapIds),
    selectIn(
      supabase,
      'nexus_class_recap_progress',
      'recap_id, student_id, status, started_at, furthest_position_seconds, last_heartbeat_at',
      'recap_id',
      recapIds,
      byStudents,
    ),
    selectIn(supabase, 'nexus_class_recap_activity_days', 'recap_id, student_id, day, last_at', 'recap_id', recapIds, byStudents),
    selectIn(
      supabase,
      'nexus_test_attempts',
      'test_id, student_id, percentage, submitted_at',
      'test_id',
      testIds,
      (q) => byStudents(q).eq('mode', 'official').eq('status', 'submitted'),
    ),
  ]);

  const duration = new Map<string, number>();
  for (const r of recaps.rows) {
    if (r.video_duration_seconds > 0) duration.set(r.id, r.video_duration_seconds);
  }

  // Section number within its recap, 1-based, in playing order.
  const sectionInfo = new Map<string, { recapId: string; no: number }>();
  const byRecap = new Map<string, any[]>();
  for (const s of sections.rows) {
    const list = byRecap.get(s.recap_id) || [];
    list.push(s);
    byRecap.set(s.recap_id, list);
  }
  for (const [recapId, list] of byRecap) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    list.forEach((s, i) => sectionInfo.set(s.id, { recapId, no: i + 1 }));
  }

  const out: CatchupActivity = { recap: new Map(), test: new Map(), dayHistory: !days.missing };
  const ensure = (recapId: string, studentId: string): RecapActivity => {
    const key = k(recapId, studentId);
    let a = out.recap.get(key);
    if (!a) {
      a = {
        watchedPct: null,
        startedAt: null,
        lastActiveAt: null,
        completed: false,
        activeDays: null,
        checkpoint: null,
      };
      out.recap.set(key, a);
    }
    return a;
  };

  for (const p of progress.rows) {
    const a = ensure(p.recap_id, p.student_id);
    const len = duration.get(p.recap_id);
    a.completed = p.status === 'completed';
    a.watchedPct = a.completed
      ? 100
      : len
        ? Math.min(100, Math.round(((p.furthest_position_seconds || 0) / len) * 100))
        : null;
    a.startedAt = p.started_at ?? null;
    a.lastActiveAt = later(a.lastActiveAt, p.last_heartbeat_at ?? p.started_at ?? null);
  }

  for (const d of days.rows) {
    const a = ensure(d.recap_id, d.student_id);
    a.activeDays = (a.activeDays ?? 0) + 1;
    a.lastActiveAt = later(a.lastActiveAt, d.last_at ?? null);
  }

  // Checkpoint tries. Needs the section ids first, so it cannot join the wave
  // above; one more query, still independent of cohort size.
  const sectionIds = [...sectionInfo.keys()];
  if (sectionIds.length > 0) {
    const attempts = await selectIn(
      supabase,
      'nexus_class_recap_attempts',
      'student_id, section_id, passed, created_at',
      'section_id',
      sectionIds,
      byStudents,
    );
    // Per (student, section): failures since the last pass.
    const tally = new Map<string, { fails: number; lastPassAt: string | null; rows: any[] }>();
    for (const t of attempts.rows) {
      const key = k(t.section_id, t.student_id);
      const entry = tally.get(key) || { fails: 0, lastPassAt: null, rows: [] };
      entry.rows.push(t);
      tally.set(key, entry);
    }
    for (const [key, entry] of tally) {
      const [sectionId, studentId] = key.split(':');
      const info = sectionInfo.get(sectionId);
      if (!info) continue;
      entry.rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      let fails = 0;
      let last: string | null = null;
      for (const r of entry.rows) {
        fails = r.passed ? 0 : fails + 1;
        last = later(last, r.created_at ?? null);
      }
      const a = ensure(info.recapId, studentId);
      a.lastActiveAt = later(a.lastActiveAt, last);
      if (fails > 0 && (!a.checkpoint || fails > a.checkpoint.fails)) {
        a.checkpoint = { sectionNo: info.no, fails };
      }
    }
  }

  for (const t of tests.rows) {
    const key = k(t.test_id, t.student_id);
    const pct = t.percentage == null ? null : Math.round(Number(t.percentage));
    const prev = out.test.get(key) || { attempts: 0, lastPct: null, bestPct: null, _at: '' as string };
    const at = String(t.submitted_at || '');
    out.test.set(key, {
      attempts: prev.attempts + 1,
      lastPct: at >= (prev as any)._at ? pct : prev.lastPct,
      bestPct: pct == null ? prev.bestPct : Math.max(prev.bestPct ?? 0, pct),
      _at: at >= (prev as any)._at ? at : (prev as any)._at,
    } as TestActivity);
  }
  for (const v of out.test.values()) delete (v as any)._at;

  return out;
}

export const activityKey = k;
