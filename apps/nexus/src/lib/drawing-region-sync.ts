/**
 * Mirror a review's region boxes onto `drawing_annotation`.
 *
 * Region boxes are the last of the three markup mechanisms still stored only in
 * `drawing_submissions.ai_overlay_annotations`. Canvas strokes and labels
 * already live on `drawing_annotation` beside the AI's own marks; this puts the
 * boxes there too, so everything a teacher marks on a sheet is readable in one
 * shape by whatever learns from it.
 *
 * A mirror, not a move. The review screen still reads boxes from the old column
 * and the manual Gemini prompts are built from the same state, so this changes
 * nothing a teacher sees. It is written from the review save, which every path
 * (draft, complete, redo, hold) already goes through, so no path can forget it.
 *
 * Never fatal. A review must save even if this environment has no marks tables.
 */

import { regionsToMarks } from './drawing-marks';
import type { RegionAnnotation } from './drawing-prompt-templates';

const MANUAL_PROMPT_VERSION = 'manual-canvas-v1';

/** Only the current shape counts. The legacy {area,label,severity} rows are inert. */
export function currentShapeRegions(input: unknown): RegionAnnotation[] | null {
  if (input === null) return [];
  if (!Array.isArray(input)) return null;
  const regions = input.filter(
    (r): r is RegionAnnotation =>
      !!r && typeof r === 'object'
      && ['x', 'y', 'width', 'height'].every((k) => typeof (r as Record<string, unknown>)[k] === 'number'),
  );
  // An array of nothing but legacy rows is not a statement about boxes at all.
  if (input.length > 0 && regions.length === 0) return null;
  return regions;
}

export async function syncRegionMarks(
  supabase: any,
  submissionId: string,
  userId: string,
  rawRegions: unknown,
): Promise<{ synced: number } | null> {
  const regions = currentShapeRegions(rawRegions);
  if (regions === null) return null;

  const { data: existing } = await supabase
    .from('drawing_evaluation')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('source', 'manual')
    .maybeSingle();

  let evaluationId = existing?.id as string | undefined;
  if (!evaluationId) {
    // Nothing to clear and nothing to add: do not create a review row just to
    // record that there are no boxes.
    if (regions.length === 0) return { synced: 0 };
    const { data: created, error } = await supabase
      .from('drawing_evaluation')
      .insert({
        submission_id: submissionId,
        source: 'manual',
        status: 'reviewed',
        provider: 'manual',
        prompt_version: MANUAL_PROMPT_VERSION,
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    evaluationId = created.id as string;
  }

  // Replace only the boxes. Strokes and labels belong to the canvas and are
  // left exactly as they are.
  const { error: clearError } = await supabase
    .from('drawing_annotation')
    .delete()
    .eq('evaluation_id', evaluationId)
    .eq('kind', 'region');
  if (clearError) throw new Error(clearError.message);

  if (regions.length > 0) {
    const { error } = await supabase.from('drawing_annotation').insert(
      regionsToMarks(regions).map((mark) => ({
        evaluation_id: evaluationId,
        source: 'human',
        action: 'created',
        kind: mark.kind,
        geometry: mark.geometry,
        marker: mark.marker,
        comment: mark.comment,
        style: mark.style,
      })),
    );
    if (error) throw new Error(error.message);
  }

  return { synced: regions.length };
}
