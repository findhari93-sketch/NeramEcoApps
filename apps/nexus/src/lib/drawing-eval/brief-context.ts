/**
 * Everything a submission needs before it can be evaluated: which brief type
 * it belongs to, what that brief type is judged on, and the graded anchor
 * sheets to compare it against.
 *
 * Kept separate from evaluate.ts so the assembly can be tested without a model
 * and without a network, which is most of what can go wrong here.
 */

import type { PromptAnchor, PromptCriterion } from './prompt';

/** Anchors expected per brief type, one per band. */
export const REQUIRED_ANCHOR_BANDS = [1, 2, 3, 4, 5] as const;

/** Cap on bytes sent inline. Gemini rejects inline_data near 20 MB, and base64 adds a third. */
export const MAX_INLINE_BYTES = 14 * 1024 * 1024;

export interface BriefTypeRow {
  id: string;
  key: string;
  category: string;
  sub_type: string;
  title: string;
  description: string | null;
  is_active: boolean;
}

export interface ResolvedContext {
  briefType: BriefTypeRow;
  criteria: PromptCriterion[];
  anchors: PromptAnchor[];
  questionText: string | null;
}

export type ContextOutcome =
  | { ok: true; context: ResolvedContext }
  | { ok: false; reason: string };

/**
 * Which brief type a submission belongs to.
 *
 * Submissions arrive by three different routes and only one of them carries a
 * drawing_questions row, so resolution is centralised here rather than guessed
 * at each call site.
 *
 * Precedence: the question the student answered, then the exam question, then
 * the assignment's backing question row. A submission that resolves to nothing
 * is simply not evaluable. It is skipped, never guessed: evaluating a still
 * life against geometric-composition anchors would produce a confident,
 * plausible and completely wrong result.
 */
export async function resolveBriefType(
  supabase: any,
  submission: {
    id: string;
    question_id?: string | null;
    exam_qb_question_id?: string | null;
    assignment_id?: string | null;
  },
): Promise<{ briefType: BriefTypeRow | null; questionText: string | null; reason?: string }> {
  let category: string | null = null;
  let subType: string | null = null;
  let questionText: string | null = null;

  const questionId = submission.question_id ?? null;
  if (questionId) {
    const { data } = await supabase
      .from('drawing_questions')
      .select('category, sub_type, question_text')
      .eq('id', questionId)
      .maybeSingle();
    if (data) {
      category = data.category ?? null;
      subType = data.sub_type ?? null;
      questionText = data.question_text ?? null;
    }
  }

  // Exam drawings hang off nexus_qb_questions, which carries the wording but
  // no category or sub_type: the bank was never given the brief dimension.
  // So an exam sheet contributes its question text and nothing else, and
  // stays unevaluable unless it also has a drawing_questions mirror. Inferring
  // a brief type from the question wording would be a guess, and a wrong guess
  // here scores a still life against geometric-composition anchors.
  const examId = submission.exam_qb_question_id ?? null;
  if (examId && !questionText) {
    const { data } = await supabase
      .from('nexus_qb_questions')
      .select('question_text')
      .eq('id', examId)
      .maybeSingle();
    if (data) questionText = data.question_text ?? questionText;
  }

  if (!category || !subType || subType === 'assignment') {
    return {
      briefType: null,
      questionText,
      reason:
        'This submission is not linked to a brief type yet, so there are no anchors to compare it against.',
    };
  }

  const { data: brief } = await supabase
    .from('drawing_brief_type')
    .select('id, key, category, sub_type, title, description, is_active')
    .eq('category', category)
    .eq('sub_type', subType)
    .maybeSingle();

  if (!brief) {
    return {
      briefType: null,
      questionText,
      reason: `No brief type is set up for ${category} / ${subType}.`,
    };
  }

  return { briefType: brief as BriefTypeRow, questionText };
}

export async function loadCriteria(supabase: any, briefTypeId: string): Promise<PromptCriterion[]> {
  const { data } = await supabase
    .from('drawing_criterion')
    .select('key, title, observable_checks, band_descriptions, sort_order')
    .eq('brief_type_id', briefTypeId)
    .order('sort_order', { ascending: true });

  return ((data || []) as any[]).map((row) => ({
    key: row.key,
    title: row.title,
    observableChecks: Array.isArray(row.observable_checks) ? row.observable_checks : [],
    bandDescriptions: (row.band_descriptions || {}) as Record<string, string>,
  }));
}

/**
 * Fetch an image and encode it for the model.
 *
 * Returns null rather than throwing so the caller decides how much a missing
 * image matters, which differs between an anchor and a student sheet.
 */
export async function fetchImagePart(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_INLINE_BYTES) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    return {
      base64: buf.toString('base64'),
      mimeType: ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg',
    };
  } catch {
    return null;
  }
}

/**
 * Load every active anchor for a brief type.
 *
 * Unlike the class wrap-up, which tolerates an unreachable board photo, a
 * missing anchor is fatal. The whole instrument is "where does this sheet sit
 * between these five", so silently comparing against four moves the scale
 * without anyone noticing.
 */
export async function loadAnchors(
  supabase: any,
  briefTypeId: string,
): Promise<{ anchors: PromptAnchor[]; reason?: string }> {
  const { data } = await supabase
    .from('drawing_anchor_sheet')
    .select('band, image_url, comment')
    .eq('brief_type_id', briefTypeId)
    .eq('is_active', true)
    .order('band', { ascending: true });

  const rows = (data || []) as Array<{ band: number; image_url: string; comment: string | null }>;
  const bands = new Set(rows.map((r) => r.band));
  const missing = REQUIRED_ANCHOR_BANDS.filter((b) => !bands.has(b));
  if (missing.length > 0) {
    return {
      anchors: [],
      reason: `Anchors are missing for band ${missing.join(', ')}. All five are needed before a sheet can be placed against them.`,
    };
  }

  const anchors: PromptAnchor[] = [];
  for (const row of rows) {
    const part = await fetchImagePart(row.image_url);
    if (!part) {
      return {
        anchors: [],
        reason: `The band ${row.band} anchor image could not be loaded, so the comparison would be against an incomplete scale.`,
      };
    }
    anchors.push({ band: row.band, comment: row.comment, ...part });
  }

  return { anchors };
}

/** Assemble the full context, or say precisely why it cannot be assembled. */
export async function buildContext(
  supabase: any,
  submission: {
    id: string;
    question_id?: string | null;
    exam_qb_question_id?: string | null;
    assignment_id?: string | null;
  },
): Promise<ContextOutcome> {
  const { briefType, questionText, reason } = await resolveBriefType(supabase, submission);
  if (!briefType) return { ok: false, reason: reason || 'Brief type could not be resolved.' };

  if (!briefType.is_active) {
    return {
      ok: false,
      reason: `The "${briefType.title}" brief type is not active yet. Its band descriptions still need to be written.`,
    };
  }

  const criteria = await loadCriteria(supabase, briefType.id);
  if (criteria.length === 0) {
    return { ok: false, reason: `No criteria are defined for "${briefType.title}".` };
  }

  const { anchors, reason: anchorReason } = await loadAnchors(supabase, briefType.id);
  if (anchors.length === 0) return { ok: false, reason: anchorReason || 'No anchors available.' };

  return { ok: true, context: { briefType, criteria, anchors, questionText } };
}
