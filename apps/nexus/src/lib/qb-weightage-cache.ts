/**
 * Shared cache for the chapter weightage counts.
 *
 * The counts are the same for every student of an exam, so they are computed at
 * most once a minute per region and served from the Next data cache in between.
 *
 * A minute, not an hour: teachers are still sorting questions into chapters, and
 * a re-tag should show on this page while they are checking it. No write route
 * has to remember to invalidate anything, because the window is that short.
 */

import { unstable_cache } from 'next/cache';
import { getSupabaseAdminClient } from '@neram/database';
import type { QBExamType } from '@neram/database';
import type { QBWeightagePayload } from './qb-weightage';

export const QB_WEIGHTAGE_REVALIDATE_SECONDS = 60;

/** The uncached read, exported so it can be tested without Next's cache. */
export async function loadQBWeightage(exam: QBExamType): Promise<QBWeightagePayload> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase as any).rpc('nexus_qb_chapter_weightage', {
    p_exam_type: exam,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<QBWeightagePayload>;
  // bigint arrives as a string through PostgREST's jsonb; coerce once here.
  const n = (v: unknown) => Number(v) || 0;
  return {
    exam_type: exam,
    papers: (raw.papers ?? []).map((p) => ({ year: n(p.year), papers: n(p.papers) })),
    totals: (raw.totals ?? []).map((t) => ({ section: String(t.section), year: n(t.year), questions: n(t.questions) })),
    cells: (raw.cells ?? []).map((c) => ({
      section: String(c.section),
      year: n(c.year),
      chapter: String(c.chapter),
      questions: n(c.questions),
    })),
    chapters: (raw.chapters ?? []).map((c) => ({
      slug: String(c.slug),
      label: String(c.label),
      unit: String(c.unit),
      unit_label: String(c.unit_label),
      unit_order: n(c.unit_order),
      chapter_order: n(c.chapter_order),
      has_children: Boolean(c.has_children),
    })),
  };
}

export const getCachedQBWeightage = unstable_cache(loadQBWeightage, ['qb-weightage-v1'], {
  revalidate: QB_WEIGHTAGE_REVALIDATE_SECONDS,
  tags: ['qb-weightage'],
});
