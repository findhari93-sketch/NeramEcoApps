import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { findSimilarQuestions } from '@neram/database';

/**
 * POST /api/question-bank/import/preview   (teacher/admin)
 *
 * Second step of the AI import: the wizard has already parsed the paste
 * client-side, so this route only answers "have we got these already?".
 *
 * Body: { questions: [{ key, question_text, exam_relevance? }] }
 * Returns one verdict per question with a SUGGESTED action, which the review
 * screen preselects. The teacher can override every one of them; nothing here
 * writes anything.
 */

/** Above this, the two questions are the same question wearing different words. */
const REUSE_THRESHOLD = 0.9;
/** Between this and REUSE_THRESHOLD, close enough that a human should look. */
const REVIEW_THRESHOLD = 0.75;

export type ImportAction = 'create' | 'reuse' | 'review';

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    // Gated on the staff tier, not user_type: a manager row is
    // user_type='student' with staff_role='manager'.
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can import questions' }, { status: 403 });
    }

    const body = await request.json();
    const rows = Array.isArray(body?.questions) ? body.questions : null;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'questions must be a non-empty array' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: 'Import at most 200 questions at a time' }, { status: 400 });
    }

    // Sequential on purpose. Each row is one pg_trgm similarity scan, and firing
    // 200 of them at once against a shared pooler is how a preview turns into an
    // outage on the rest of the app.
    const results = [];
    for (const row of rows) {
      const key = typeof row?.key === 'string' ? row.key : '';
      const text = typeof row?.question_text === 'string' ? row.question_text.trim() : '';
      if (!key || text.length < 8) {
        results.push({ key, suggested_action: 'create' as ImportAction, candidates: [] });
        continue;
      }

      const examRelevance =
        row?.exam_relevance === 'JEE' || row?.exam_relevance === 'NATA' || row?.exam_relevance === 'BOTH'
          ? row.exam_relevance
          : null;

      let candidates: Awaited<ReturnType<typeof findSimilarQuestions>> = [];
      try {
        candidates = await findSimilarQuestions({ text, examRelevance, tagIds: null });
      } catch (err) {
        // A dedupe miss must not cost the teacher the whole import. Fall back to
        // treating it as new, which is the safe direction: a duplicate that slips
        // in can be merged later, a lost question cannot be recovered.
        console.error('Import dedupe lookup failed for one row:', err);
      }

      const top = candidates[0];
      const suggested: ImportAction = !top
        ? 'create'
        : top.similarity >= REUSE_THRESHOLD
          ? 'reuse'
          : top.similarity >= REVIEW_THRESHOLD
            ? 'review'
            : 'create';

      results.push({
        key,
        suggested_action: suggested,
        /** Only meaningful for reuse/review, but sent always so the UI can show near misses. */
        candidates: candidates.map((c) => ({
          id: c.id,
          question_text: c.question_text,
          options: c.options,
          similarity: c.similarity,
          used_in_tests: c.used_in_tests,
          verdict:
            c.similarity >= REUSE_THRESHOLD
              ? 'likely_duplicate'
              : c.similarity >= REVIEW_THRESHOLD
                ? 'near_identical'
                : 'similar',
        })),
      });
    }

    const summary = results.reduce(
      (acc, r) => {
        acc[r.suggested_action] += 1;
        return acc;
      },
      { create: 0, reuse: 0, review: 0 } as Record<ImportAction, number>,
    );

    return NextResponse.json({ data: { results, summary } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check for duplicates';
    console.error('QB import preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
