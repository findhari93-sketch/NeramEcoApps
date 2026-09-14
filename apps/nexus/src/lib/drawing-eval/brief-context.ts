/**
 * Everything a submission needs before it can be evaluated: which brief type
 * it belongs to, what that brief type is judged on, and the graded anchor
 * sheets to compare it against.
 *
 * Kept separate from evaluate.ts so the assembly can be tested without a model
 * and without a network, which is most of what can go wrong here.
 */

import { briefKeyForSubmission } from '@/lib/drawing-brief-resolve';
import { criteriaForBrief } from '@/lib/drawing-rubric';

import { genericChecksFor } from './generic-checks';
import type { PromptAnchor, PromptCriterion } from './prompt';
import type { EvalMode } from './schema';

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
  mode: EvalMode;
  /** Why this draft is generic, in words. Null when anchored. */
  genericReason: string | null;
  /** Null for a sheet no brief type resolves for, the usual assignment drawing. */
  briefType: BriefTypeRow | null;
  briefKey: string | null;
  briefTitle: string;
  briefDescription: string | null;
  criteria: PromptCriterion[];
  /** Five, ascending, in anchored mode. Empty in generic mode. */
  anchors: PromptAnchor[];
  questionText: string | null;
}

/**
 * Which brief type a submission belongs to.
 *
 * Submissions arrive by three different routes and only one of them carries a
 * drawing_questions row, so resolution is centralised here rather than guessed
 * at each call site.
 *
 * Precedence: the question the student answered, then the exam question, then
 * the brief the ASSIGNMENT was tagged with. An assignment's backing question
 * carries sub_type 'assignment', a marker rather than a brief, so for the
 * assignment drawings that make up most of the queue the tag is the only
 * answer. It is set by a teacher, never inferred. A submission that resolves to nothing
 * is never given a guessed brief: evaluating a still life against
 * geometric-composition anchors would produce a confident, plausible and
 * completely wrong result. It is drafted in generic mode instead, on the
 * shared criteria, with no anchors (see resolveDraftPlan below).
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

  if ((!category || !subType || subType === 'assignment') && submission.assignment_id) {
    const { data: assignment } = await supabase
      .from('nexus_class_assignments')
      .select('brief_type_id')
      .eq('id', submission.assignment_id)
      .maybeSingle();
    if (assignment?.brief_type_id) {
      const { data: tagged } = await supabase
        .from('drawing_brief_type')
        .select('id, key, category, sub_type, title, description, is_active')
        .eq('id', assignment.brief_type_id)
        .maybeSingle();
      if (tagged) return { briefType: tagged as BriefTypeRow, questionText };
    }
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

export interface SubmissionRef {
  id: string;
  question_id?: string | null;
  exam_qb_question_id?: string | null;
  assignment_id?: string | null;
}

/**
 * What a draft of this sheet would be graded on, without downloading anything.
 *
 * The criterion KEYS always come from lib/drawing-rubric.ts, through the same
 * brief resolution the rubric route uses, so a draft never scores a criterion
 * the rubric panel does not show, and never skips one it does. The database
 * only adds wording to those keys: the brief's own observable checks when it
 * has them, and its band descriptions when the brief is anchored.
 *
 * `mode` here is what the rows allow. buildContext can still fall back to
 * generic when an anchor image fails to download.
 */
export interface DraftPlan {
  mode: EvalMode;
  /** Why this is not anchored, in words. Null when it is. */
  genericReason: string | null;
  briefType: BriefTypeRow | null;
  briefKey: string | null;
  briefTitle: string;
  briefDescription: string | null;
  criteria: PromptCriterion[];
  questionText: string | null;
  anchorRows: Array<{ band: number; image_url: string; comment: string | null }>;
}

async function loadAnchorRows(
  supabase: any,
  briefTypeId: string,
): Promise<Array<{ band: number; image_url: string; comment: string | null }>> {
  const { data } = await supabase
    .from('drawing_anchor_sheet')
    .select('band, image_url, comment')
    .eq('brief_type_id', briefTypeId)
    .eq('is_active', true)
    .order('band', { ascending: true });
  return Array.isArray(data) ? data : [];
}

/** The assignment's own title and instructions, the best description a generic draft has. */
async function loadAssignmentText(
  supabase: any,
  assignmentId: string | null | undefined,
): Promise<{ title: string | null; instructions: string | null }> {
  if (!assignmentId) return { title: null, instructions: null };
  try {
    const { data } = await supabase
      .from('nexus_class_assignments')
      .select('title, instructions')
      .eq('id', assignmentId)
      .maybeSingle();
    return {
      title: typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : null,
      instructions: typeof data?.instructions === 'string' && data.instructions.trim() ? data.instructions.trim() : null,
    };
  } catch {
    return { title: null, instructions: null };
  }
}

export async function resolveDraftPlan(supabase: any, submission: SubmissionRef): Promise<DraftPlan> {
  const [{ briefType, questionText }, briefKey, assignment] = await Promise.all([
    resolveBriefType(supabase, submission),
    briefKeyForSubmission(supabase, submission),
    loadAssignmentText(supabase, submission.assignment_id),
  ]);

  const rubric = criteriaForBrief(briefKey);
  const dbCriteria = briefType ? await loadCriteria(supabase, briefType.id) : [];
  const dbByKey = new Map(dbCriteria.map((c) => [c.key, c]));

  let genericReason: string | null = null;
  let anchorRows: DraftPlan['anchorRows'] = [];

  if (!briefType) {
    genericReason = 'This sheet is not linked to a brief type, so it is drafted on the shared criteria without reference sheets.';
  } else if (briefKey !== briefType.key) {
    genericReason = `The brief resolved two different ways (${briefKey ?? 'none'} and ${briefType.key}), so it is drafted without reference sheets.`;
  } else if (!briefType.is_active) {
    genericReason = `The "${briefType.title}" brief type is not active yet, so it is drafted without reference sheets.`;
  } else if (rubric.some((c) => !dbByKey.has(c.key))) {
    genericReason = `"${briefType.title}" is missing wording for some rubric criteria, so it is drafted without reference sheets.`;
  } else {
    anchorRows = await loadAnchorRows(supabase, briefType.id);
    const bands = new Set(anchorRows.map((r) => r.band));
    const missing = REQUIRED_ANCHOR_BANDS.filter((b) => !bands.has(b));
    if (missing.length > 0) {
      genericReason = `Reference sheets are missing for band ${missing.join(', ')}, so it is drafted without them.`;
      anchorRows = [];
    }
  }

  const mode: EvalMode = genericReason ? 'generic' : 'anchored';

  const criteria: PromptCriterion[] = rubric.map((c) => {
    const db = dbByKey.get(c.key);
    const checks = db && db.observableChecks.length > 0 ? db.observableChecks : genericChecksFor(c.key);
    return {
      key: c.key,
      title: c.title,
      observableChecks: checks.length > 0 ? checks : [c.hint],
      // Band wording is the teacher's, and only trusted once the brief is
      // active. Generic mode grades on its own fixed scale instead.
      bandDescriptions: mode === 'anchored' && db ? db.bandDescriptions : {},
    };
  });

  const briefTitle =
    briefType?.title ||
    assignment.title ||
    (submission.exam_qb_question_id ? 'Exam drawing' : 'Drawing sheet');
  const briefDescription = briefType?.description || assignment.instructions || null;

  return {
    mode,
    genericReason,
    briefType,
    briefKey,
    briefTitle,
    briefDescription,
    criteria,
    questionText,
    anchorRows,
  };
}

/**
 * Assemble the full context for one draft.
 *
 * Never refuses. Before automatic drafting this answered "not evaluable" for
 * any sheet without an active, fully anchored brief, which was every sheet.
 * Now such a sheet is drafted in generic mode, and anchored mode is used only
 * when all five reference images actually download: comparing against four
 * would move the scale without anyone noticing, so a failed image drops the
 * comparison entirely rather than using what arrived.
 */
export async function buildContext(supabase: any, submission: SubmissionRef): Promise<ResolvedContext> {
  const plan = await resolveDraftPlan(supabase, submission);

  let mode = plan.mode;
  let genericReason = plan.genericReason;
  const anchors: PromptAnchor[] = [];

  if (mode === 'anchored') {
    for (const row of plan.anchorRows) {
      const part = await fetchImagePart(row.image_url);
      if (!part) {
        mode = 'generic';
        genericReason = `The band ${row.band} reference image could not be loaded, so this was drafted without reference sheets.`;
        anchors.length = 0;
        break;
      }
      anchors.push({ band: row.band, comment: row.comment, ...part });
    }
  }

  const criteria =
    mode === plan.mode ? plan.criteria : plan.criteria.map((c) => ({ ...c, bandDescriptions: {} }));

  return {
    mode,
    genericReason,
    briefType: plan.briefType,
    briefKey: plan.briefKey,
    briefTitle: plan.briefTitle,
    briefDescription: plan.briefDescription,
    criteria,
    anchors,
    questionText: plan.questionText,
  };
}
