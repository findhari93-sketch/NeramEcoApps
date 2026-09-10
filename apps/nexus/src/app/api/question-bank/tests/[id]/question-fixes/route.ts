import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { errorResponse } from '@/lib/api-errors';
import {
  countScoredAttempts,
  getSupabaseAdminClient,
  recordQuestionEdit,
  updateQBQuestion,
} from '@neram/database';

/**
 * POST /api/question-bank/tests/[id]/question-fixes            (staff)
 *
 * Apply teacher-approved corrections to questions on ONE test, from the
 * question analysis tab. The body carries only the fields the teacher actually
 * ticked in the review step, so a reply that suggested four changes to a
 * question can land as one.
 *
 * Three guards, each earning its place:
 *
 *  1. verifyQBStaff, NOT the hand-rolled `['teacher','admin'].includes(...)`
 *     that questions/[id] PATCH still uses. That check refuses a manager (a
 *     manager row is user_type='student' with staff_role='manager'), which is
 *     the exact bug qb-auth.ts was written to end.
 *
 *  2. Every question id must be on THIS test. A staff-only route is still not a
 *     reason to trust an id: without this, the endpoint would edit any question
 *     in the bank for anyone who could reach one test.
 *
 *  3. A field whitelist rather than passing the body through. updateQBQuestion
 *     has no whitelist of its own, so a spread here would let a caller set
 *     status, is_active or origin from a dialog that has no business naming
 *     them.
 *
 * The response reports how many scored attempts sit on the questions whose
 * answer key moved. That number is what turns "saved" into "saved, and sixteen
 * people were graded on the old key", which is the whole reason the re-grade
 * step exists.
 */

interface Ctx {
  params: { id: string };
}

/** The only columns this route may write. */
const WRITABLE = ['question_text', 'options', 'correct_answer', 'explanation_brief'] as const;
type WritableField = (typeof WRITABLE)[number];

interface FixInput {
  question_id: string;
  /** Partial by design: only the ticked fields arrive. */
  fields: Partial<Record<WritableField, unknown>>;
  source?: 'inline' | 'ai_review';
}

/** An option row as the bank stores it, which is what the grader compares. */
function readOptions(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: Array<Record<string, unknown>> = [];
  for (const raw of value) {
    const o = raw as Record<string, unknown>;
    const id = typeof o?.id === 'string' ? o.id.trim() : '';
    const text = typeof o?.text === 'string' ? o.text : '';
    if (!id) return null;
    out.push({ id, text, image_url: o?.image_url ?? null });
  }
  return out;
}

function readText(value: unknown, cap: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, cap) : null;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await verifyQBStaff(request.headers.get('Authorization'));
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}) as any);
    const fixes: FixInput[] = Array.isArray(body?.fixes) ? body.fixes : [];
    if (fixes.length === 0) {
      return NextResponse.json({ error: 'Nothing to apply.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Guard 2. The set of questions this test is actually composed of.
    const { data: links, error: linkErr } = await supabase
      .from('nexus_test_questions')
      .select('qb_question_id')
      .eq('test_id', params.id);
    if (linkErr) throw linkErr;
    const onThisTest = new Set(
      ((links || []) as any[]).map((l) => l.qb_question_id).filter(Boolean) as string[],
    );

    const wanted = fixes.map((f) => f.question_id).filter((id) => onThisTest.has(id));
    if (wanted.length === 0) {
      return NextResponse.json(
        { error: 'None of those questions are on this test.' },
        { status: 400 },
      );
    }

    const { data: current, error: curErr } = await supabase
      .from('nexus_qb_questions')
      .select('id, question_text, options, correct_answer, explanation_brief')
      .in('id', wanted);
    if (curErr) throw curErr;
    const currentBy = new Map<string, any>(((current || []) as any[]).map((q) => [q.id, q]));

    const applied: Array<{ question_id: string; fields: string[] }> = [];
    const skipped: Array<{ question_id: string; reason: string }> = [];
    const keyChanged: string[] = [];

    for (const fix of fixes) {
      const existing = currentBy.get(fix.question_id);
      if (!existing) {
        skipped.push({ question_id: fix.question_id, reason: 'not on this test' });
        continue;
      }

      // Guard 3. Built key by key from the whitelist, so an unexpected field in
      // the body is not written, and not silently accepted either.
      const patch: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      for (const field of WRITABLE) {
        if (!Object.prototype.hasOwnProperty.call(fix.fields || {}, field)) continue;
        const raw = (fix.fields as Record<string, unknown>)[field];

        if (field === 'options') {
          const options = readOptions(raw);
          if (!options) {
            skipped.push({ question_id: fix.question_id, reason: 'options were not usable' });
            continue;
          }
          patch.options = options;
        } else if (field === 'correct_answer') {
          const text = readText(raw, 200);
          // Clearing an answer key makes the question ungradable, and nothing on
          // the review screen offers that. A null here is a bug upstream.
          if (text === undefined || text === null) {
            skipped.push({
              question_id: fix.question_id,
              reason: 'refused to clear the correct answer',
            });
            continue;
          }
          patch.correct_answer = text;
        } else {
          const text = readText(raw, field === 'question_text' ? 4000 : 2000);
          if (text === undefined) continue;
          if (field === 'question_text' && text === null) {
            skipped.push({ question_id: fix.question_id, reason: 'refused to blank the question' });
            continue;
          }
          patch[field] = text;
        }

        before[field] = existing[field] ?? null;
        after[field] = patch[field];
      }

      const fields = Object.keys(patch);
      if (fields.length === 0) continue;

      await updateQBQuestion(fix.question_id, patch as any, supabase);
      await recordQuestionEdit(
        {
          questionId: fix.question_id,
          testId: params.id,
          editedBy: auth.caller.id,
          source: fix.source === 'ai_review' ? 'ai_review' : 'inline',
          before,
          after,
        },
        supabase,
      );

      applied.push({ question_id: fix.question_id, fields });
      if (fields.includes('correct_answer')) keyChanged.push(fix.question_id);
    }

    // Only asked for when a key actually moved. A wording fix changes nothing
    // about a recorded score, and offering a re-grade after one would train the
    // teacher to press through a dialog that usually does nothing.
    const staleAttempts =
      keyChanged.length > 0 ? await countScoredAttempts(params.id, null, supabase) : 0;

    return NextResponse.json({
      data: {
        applied,
        skipped,
        answer_key_changed: keyChanged,
        stale_attempts: staleAttempts,
      },
    });
  } catch (err) {
    return errorResponse(err, 'Could not apply those fixes');
  }
}
