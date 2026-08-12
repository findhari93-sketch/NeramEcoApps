/**
 * Activating a paper's questions, in one place.
 *
 * Activation is not just a flag. Every DRAWING_PROMPT that goes active also
 * needs its drawing_questions bridge row, or the drawing practice module cannot
 * see it. That pairing used to live only inside the activate route, so the
 * one-press import flow would have had to either duplicate it or call its own
 * API over HTTP. Both are how the two drift.
 */

import { getSupabaseAdminClient, bulkActivateQuestions } from '@neram/database';
import { createDrawingQuestionFromQB } from '@neram/database/queries/nexus';

export interface ActivatePaperResult {
  activated: number;
  drawing_questions_bridged: number;
}

export async function activatePaperQuestions(paperId: string): Promise<ActivatePaperResult> {
  const supabase = getSupabaseAdminClient();
  const result = await bulkActivateQuestions(paperId);

  const { data: drawingQuestions } = await supabase
    .from('nexus_qb_questions')
    .select('id')
    .eq('original_paper_id', paperId)
    .eq('question_format', 'DRAWING_PROMPT')
    .eq('is_active', true);

  let bridged = 0;
  for (const dq of drawingQuestions || []) {
    try {
      await createDrawingQuestionFromQB(dq.id);
      bridged++;
    } catch {
      // Non-fatal. A missing bridge costs the drawing module one question; a
      // throw here would cost the teacher the whole activation.
      console.warn(`[activate paper] could not bridge drawing question ${dq.id}`);
    }
  }

  return { activated: result.activated, drawing_questions_bridged: bridged };
}
