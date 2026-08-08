/**
 * The classes a student may watch again, which is the ones they do not owe.
 *
 * This is the other half of the student's Catch-up screen. "To do" is built from
 * `nexus_class_absences`, the obligation table. This list is built by taking the
 * classroom's published recaps and REMOVING everything that table still has open
 * against this student. What is left is every class they sat in, plus the ones
 * they have already cleared or been excused from.
 *
 * Deriving it as a set difference, in the same request that builds the backlog,
 * is the point. The two lists cannot disagree about where a class belongs
 * because there is only one predicate (`hasOpenObligation`) and one moment at
 * which it is applied. A class is in exactly one of the two tabs, always.
 *
 * Lives in the app rather than in `packages/database` on purpose: that package
 * is in the shared deploy path filter, so a change there rebuilds all four apps.
 * The batched-query shape and its fake-client test are modelled on
 * `lib/catchup-facts.ts`.
 */

import { hasOpenObligation } from './recap-obligation';

/**
 * How many of the classroom's recaps to look at, newest first.
 *
 * Bounds every follow-up `.in(...)` in this module to a list PostgREST can
 * carry in a query string, so unlike `catchup-facts.ts` there is no chunking to
 * do. A classroom under the per-year cohort convention runs on the order of a
 * hundred classes, so this reaches back across the whole year in the normal case.
 */
const SCAN_LIMIT = 120;

/** How many cards the tab will actually show. */
export const REWATCHABLE_LIMIT = 60;

export interface RewatchableRecap {
  recap_id: string;
  class_id: string;
  title: string;
  /** The class date, as stored. Formatted by the caller. */
  date: string;
  section_count: number;
  /** They have been all the way through it before. Not a requirement for anything. */
  watched: boolean;
}

export interface RewatchableResult {
  rewatchable: RewatchableRecap[];
  /** More exist than were returned, so the tab can say so rather than imply completeness. */
  truncated: boolean;
}

const EMPTY: RewatchableResult = { rewatchable: [], truncated: false };

/**
 * A recap students can actually be sent to.
 *
 * `readiness` is orthogonal to `status`: a recap can be published and still be
 * held back because its generated questions did not clear the quality bar. The
 * byte route refuses those, so offering a card for one would produce a dead end.
 * NULL predates the readiness column and means "nothing has held this back".
 */
function isServable(readiness: string | null | undefined): boolean {
  return readiness == null || readiness === 'ready';
}

/**
 * Every class in this classroom whose recording this student may simply watch.
 *
 * Never throws. This decorates a secondary tab on a screen whose primary job is
 * to tell a student what they owe, and a failed lookup here must not take that
 * screen down with it. An empty list reads as "nothing to rewatch", which is the
 * same thing the student saw before this tab existed.
 */
export async function listRewatchableRecaps(
  supabase: any,
  studentId: string,
  classroomId: string,
): Promise<RewatchableResult> {
  if (!studentId || !classroomId) return EMPTY;

  try {
    const { data: recapRows, error } = await supabase
      .from('nexus_class_recaps')
      .select('id, scheduled_class_id, title, readiness, sections:nexus_class_recap_sections(id)')
      .eq('classroom_id', classroomId)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT);
    if (error) throw error;

    // Both filters are applied here rather than in the query. `classroom_id`
    // has already cut this to one classroom, so the set is small, and expressing
    // "readiness IS NULL OR readiness = ready" in PostgREST costs more clarity
    // than it saves bytes.
    //
    // A null scheduled_class_id is an ad-hoc recap, created from a pasted
    // recording link with no class behind it. It has no date, no attendance and
    // no obligation, so there is nothing to say about it on this screen.
    // Foundation chapter tracks drop out here too: they carry a study_file_id
    // and a null classroom_id, so the query above never sees them.
    const candidates = (recapRows || []).filter(
      (r: any) => r.scheduled_class_id && isServable(r.readiness),
    );
    if (!candidates.length) return EMPTY;

    const classIds = [...new Set(candidates.map((r: any) => r.scheduled_class_id))] as string[];
    const recapIds = candidates.map((r: any) => r.id) as string[];

    const [classesRes, absencesRes, progressRes] = await Promise.all([
      supabase.from('nexus_scheduled_classes').select('id, title, scheduled_date').in('id', classIds),
      supabase
        .from('nexus_class_absences')
        .select('scheduled_class_id, caught_up_at, excused_at')
        .eq('student_id', studentId)
        .in('scheduled_class_id', classIds),
      supabase
        .from('nexus_class_recap_progress')
        .select('recap_id, status')
        .eq('student_id', studentId)
        .in('recap_id', recapIds),
    ]);

    const classById = new Map<string, { title: string | null; scheduled_date: string | null }>();
    for (const c of classesRes?.data || []) {
      classById.set(c.id, { title: c.title ?? null, scheduled_date: c.scheduled_date ?? null });
    }

    // Only the rows that are still open. A cleared or excused class is as
    // rewatchable as one they attended.
    const owed = new Set<string>();
    for (const a of absencesRes?.data || []) {
      if (hasOpenObligation(a)) owed.add(a.scheduled_class_id);
    }

    const completed = new Set<string>();
    for (const p of progressRes?.data || []) {
      if (p.status === 'completed') completed.add(p.recap_id);
    }

    const rows: RewatchableRecap[] = [];
    for (const r of candidates) {
      if (owed.has(r.scheduled_class_id)) continue;
      const cls = classById.get(r.scheduled_class_id);
      // No class row means the class was deleted out from under the recap. It
      // has no date to sit under, so there is nowhere on this list to put it.
      if (!cls?.scheduled_date) continue;
      rows.push({
        recap_id: r.id,
        class_id: r.scheduled_class_id,
        // The live class title wins over the recap's stored copy, the same
        // precedence `withClassTitles` applies everywhere else.
        title: cls.title || r.title || 'Class',
        date: cls.scheduled_date,
        section_count: (r.sections || []).length,
        watched: completed.has(r.id),
      });
    }

    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      rewatchable: rows.slice(0, REWATCHABLE_LIMIT),
      truncated: rows.length > REWATCHABLE_LIMIT,
    };
  } catch (err) {
    console.error('[rewatchable] lookup failed (non-fatal):', err instanceof Error ? err.message : err);
    return EMPTY;
  }
}
