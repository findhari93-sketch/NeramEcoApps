/**
 * What an AI check said about a question, and what it changed.
 *
 * The test results screen sends questions to an external AI and brings the
 * verdict back. nexus_qb_question_edits records a change and nothing else, so a
 * check that found nothing wrong left no trace: a teacher looking at a pool of
 * 150 could not tell which questions had already been looked at, and sent the
 * same ones again.
 *
 * Keyed on the QUESTION rather than the test. The wording and key an AI judged
 * are the same in every paper that reuses the question, so a check made from
 * one paper counts in all of them.
 *
 * Both writes and reads are best-effort. The history decorates a report; it is
 * never a reason to fail one, or to refuse an edit a teacher already approved.
 */

import { getSupabaseAdminClient } from '../../client';
import type { TypedSupabaseClient } from '../../client';

const REVIEWS = 'nexus_qb_question_reviews';
const EDITS = 'nexus_qb_question_edits';

export type NexusQuestionReviewVerdict = 'wrong_key' | 'ambiguous' | 'hard_but_fair' | 'fine';

export const NEXUS_QUESTION_REVIEW_VERDICTS: NexusQuestionReviewVerdict[] = [
  'wrong_key',
  'ambiguous',
  'hard_but_fair',
  'fine',
];

export interface RecordQuestionReviewInput {
  questionId: string;
  testId?: string | null;
  placementId?: string | null;
  verdict: NexusQuestionReviewVerdict;
  note?: string | null;
  /** The fields the teacher accepted from this check. Empty means nothing changed. */
  appliedFields: string[];
  /** The audit row those fields were written through. */
  editId?: string | null;
  /** The correct rate the teacher was looking at, for "was 0%, now 44%". */
  correctPctAtCheck?: number | null;
  answeredAtCheck?: number | null;
  reviewedBy?: string | null;
}

/** Writes the checks. Returns how many landed; logs and returns 0 on failure. */
export async function recordQuestionReviews(
  rows: RecordQuestionReviewInput[],
  client?: TypedSupabaseClient,
): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any).from(REVIEWS).insert(
    rows.map((r) => ({
      question_id: r.questionId,
      test_id: r.testId ?? null,
      placement_id: r.placementId ?? null,
      verdict: r.verdict,
      note: r.note ?? null,
      applied_fields: r.appliedFields || [],
      edit_id: r.editId ?? null,
      correct_pct_at_check: r.correctPctAtCheck ?? null,
      answered_at_check: r.answeredAtCheck ?? null,
      reviewed_by: r.reviewedBy ?? null,
    })),
  );
  if (error) {
    console.error('Question review insert failed:', error.message);
    return 0;
  }
  return rows.length;
}

/** The latest check that changed something. */
export interface NexusQuestionAiFix {
  at: string;
  fields: string[];
  /** Only the fields that changed, as the edits log stores them. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** Null for a fix recorded before verdicts were stored. */
  verdict: NexusQuestionReviewVerdict | null;
  /** The correct rate at the time of the check, when it was recorded. */
  pct_before: number | null;
}

export interface NexusQuestionAiStatus {
  /** AI checks on this question, made from any paper. */
  checks: number;
  last_checked_at: string | null;
  last_verdict: NexusQuestionReviewVerdict | null;
  last_note: string | null;
  fixed: NexusQuestionAiFix | null;
}

interface ReviewRow {
  question_id: string;
  verdict: NexusQuestionReviewVerdict | null;
  note: string | null;
  applied_fields: string[] | null;
  edit_id: string | null;
  correct_pct_at_check: number | null;
  created_at: string;
}

interface EditRow {
  id: string;
  question_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

function emptyStatus(): NexusQuestionAiStatus {
  return { checks: 0, last_checked_at: null, last_verdict: null, last_note: null, fixed: null };
}

/**
 * Fold check rows and AI edit rows into one status per question. PURE.
 *
 * An AI edit that no check points at still counts as a check that fixed
 * something. That covers an environment where the reviews table is missing
 * (the edits log alone still says what the AI changed) and any edit written
 * between the table existing and its backfill running.
 */
export function foldQuestionAiStatus(
  reviews: ReviewRow[],
  edits: EditRow[],
): Map<string, NexusQuestionAiStatus> {
  const out = new Map<string, NexusQuestionAiStatus>();
  const editsById = new Map(edits.map((e) => [e.id, e]));
  const referenced = new Set<string>();

  const newestFirst = [...reviews].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const r of newestFirst) {
    const status = out.get(r.question_id) || emptyStatus();
    status.checks += 1;
    if (!status.last_checked_at) {
      status.last_checked_at = r.created_at;
      status.last_verdict = r.verdict ?? null;
      status.last_note = r.note ?? null;
    }
    if (r.edit_id) referenced.add(r.edit_id);
    const fields = r.applied_fields || [];
    if (!status.fixed && fields.length > 0) {
      const edit = r.edit_id ? editsById.get(r.edit_id) : undefined;
      status.fixed = {
        at: r.created_at,
        fields,
        before: edit?.before || {},
        after: edit?.after || {},
        verdict: r.verdict ?? null,
        pct_before: r.correct_pct_at_check ?? null,
      };
    }
    out.set(r.question_id, status);
  }

  for (const e of edits) {
    if (referenced.has(e.id)) continue;
    const status = out.get(e.question_id) || emptyStatus();
    status.checks += 1;
    if (!status.last_checked_at || e.created_at > status.last_checked_at) {
      status.last_checked_at = e.created_at;
      status.last_verdict = null;
      status.last_note = null;
    }
    if (!status.fixed || e.created_at > status.fixed.at) {
      status.fixed = {
        at: e.created_at,
        fields: Object.keys(e.after || {}),
        before: e.before || {},
        after: e.after || {},
        verdict: null,
        pct_before: null,
      };
    }
    out.set(e.question_id, status);
  }

  return out;
}

/**
 * The AI history of a set of questions, one status each.
 *
 * Chunked because a 150 question pool puts 150 ids in a URL. Never throws: a
 * missing or unreadable table leaves the questions looking unchecked.
 */
export async function loadQuestionAiStatus(
  questionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, NexusQuestionAiStatus>> {
  const ids = [...new Set(questionIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const supabase = client || getSupabaseAdminClient();

  const reviews: ReviewRow[] = [];
  const edits: EditRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [r, e] = await Promise.all([
      (supabase as any)
        .from(REVIEWS)
        .select('question_id, verdict, note, applied_fields, edit_id, correct_pct_at_check, created_at')
        .in('question_id', chunk),
      (supabase as any)
        .from(EDITS)
        .select('id, question_id, before, after, created_at')
        .eq('source', 'ai_review')
        .in('question_id', chunk),
    ]);
    if (r.error) console.warn('[question ai status] reviews skipped:', r.error.message);
    else reviews.push(...((r.data || []) as ReviewRow[]));
    if (e.error) console.warn('[question ai status] edits skipped:', e.error.message);
    else edits.push(...((e.data || []) as EditRow[]));
  }

  return foldQuestionAiStatus(reviews, edits);
}
