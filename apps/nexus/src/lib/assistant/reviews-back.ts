/**
 * Drawings a teacher has reviewed for this student since `sinceIso`, as the
 * student may see them: released statuses only, held reviews hidden, a sketch
 * counted by reviewed_at (it is stored 'completed' at upload), test papers left
 * to the tests page. Shared by the my_reviews tool and the brief's count.
 *
 * The IST date comes from todayIst (what istDateOf wraps) rather than an import
 * of brief-load, which imports this file.
 */
import { drawingSourceLabel, reviewStateWords, summarizeReview } from '@/lib/drawing-source';
import { heldIdsFrom, isReleasedForStudent } from '@/lib/student-drawing-payload';
import { loadManualEvaluations } from '@/lib/student-drawing-payload-server';
import { todayIst } from './format';

export interface ReviewBack { id: string; kind: string; words: string; reviewedOn: string }

export async function loadReviewsBack(supabase: any, userId: string, sinceIso: string): Promise<{ count: number; items: ReviewBack[] }> {
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('id, status, source_type, reviewed_at, tutor_rating, tutor_marks')
    .eq('student_id', userId)
    .gte('reviewed_at', sinceIso)
    .order('reviewed_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = ((data || []) as Array<{ id: string; status: string; source_type: string | null; reviewed_at: string; tutor_rating: number | null; tutor_marks: number | null }>)
    .filter((r) => r.source_type !== 'exam');
  const held = heldIdsFrom(await loadManualEvaluations(supabase, rows.map((r) => r.id)));
  const items: ReviewBack[] = [];
  for (const r of rows) {
    if (!isReleasedForStudent(r, held)) continue;
    const words = reviewStateWords(summarizeReview(r as never, true), { maxMarks: null, viewer: 'own' });
    if (!words || words.startsWith('waiting')) continue;
    items.push({ id: r.id, kind: drawingSourceLabel(r.source_type), words, reviewedOn: todayIst(new Date(r.reviewed_at)) });
  }
  return { count: items.length, items };
}
