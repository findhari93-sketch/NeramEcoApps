/**
 * One press: paper in, test out.
 *
 * Creating a paper used to be three separate calls a teacher made by hand, in
 * an order nothing enforced: POST the questions, POST activate, POST the test.
 * Miss the middle one and the test silently composes from whatever happened to
 * be active, which is how a drawing section ends up missing from a mock. Miss
 * the last one and the paper sits there with a "Build test" button nobody
 * pressed, which is exactly the manual step this route exists to delete.
 *
 * So it runs all three, in the only order that works:
 *
 *   1. apply the document  (create or update, never delete)
 *   2. activate            (drawings included, via the shared helper)
 *   3. build the test      (composes from what is active, so it must be last)
 *
 * Publishing is NOT here. It stays a deliberate press, because it is the moment
 * students see the paper and a bad parse should not reach them because someone
 * uploaded a file.
 *
 * Step 3 refuses when students have already sat the existing test.
 * generatePaperMockTest composes a NEW test and relinks the placement, so
 * rebuilding would leave their attempts hanging off a test nothing points at.
 * The route still succeeds in that case: the questions were updated, only the
 * test was left alone, and the response says so.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  applyPaperJSON,
  countPaperTestAttempts,
  generatePaperMockTest,
  getPlacedPaperTest,
  paperTitles,
  type QBPaperQuestionInput,
} from '@neram/database';
import { describeError, messageOf } from '@/lib/api-errors';
import { activatePaperQuestions } from '@/lib/activate-paper';
import { parsePaperJSON } from '@/lib/paper-json';
import { isDataUri, storeDataUri } from '@/lib/store-data-uri';

/** Human wording for the engine's sentinel errors, matching papers/[id]/test. */
const REFUSALS: Record<string, string> = {
  PAPER_NOT_FOUND: 'This paper no longer exists.',
  PAPER_HAS_NO_ACTIVE_QUESTIONS:
    'None of this paper’s questions could be activated, so there is nothing to build a test from.',
  LINK_FAILED: 'The test could not be attached. Try again.',
  NO_PAPER_IDENTITY:
    'This file does not say which paper it is. Upload it from the paper’s own page, or add exam_type and year to its "paper" block.',
};

/**
 * Put any inline images into storage and swap in their URLs.
 *
 * A downloaded-then-edited file carries absolute URLs and this does nothing.
 * An AI-generated one carries base64, which the bulk-upload prompt has always
 * allowed. Handled here rather than in the writer so that packages/database
 * never has to know about storage buckets.
 *
 * A failed image costs that image and nothing else: it is reported and the
 * question still imports, because 91 questions with one missing figure beats a
 * refused upload.
 */
async function resolveInlineImages(
  questions: QBPaperQuestionInput[],
  userId: string,
): Promise<{ questions: QBPaperQuestionInput[]; stored: number; failed: number[] }> {
  let stored = 0;
  const failed: number[] = [];

  const resolve = async (value: string, subfolder: string, number: number) => {
    const url = await storeDataUri(value, { userId, subfolder });
    if (url) {
      stored += 1;
      return url;
    }
    if (!failed.includes(number)) failed.push(number);
    return null;
  };

  const out: QBPaperQuestionInput[] = [];
  for (const q of questions) {
    const next: QBPaperQuestionInput = { ...q };

    if (isDataUri(next.question_image_url)) {
      next.question_image_url = await resolve(
        next.question_image_url as string,
        'questions',
        q.question_number,
      );
    }
    if (isDataUri(next.solution_image_url)) {
      next.solution_image_url = await resolve(
        next.solution_image_url as string,
        'solutions',
        q.question_number,
      );
    }
    if (next.options?.some((o) => isDataUri(o.image_url))) {
      next.options = await Promise.all(
        next.options.map(async (o) =>
          isDataUri(o.image_url)
            ? { ...o, image_url: (await resolve(o.image_url as string, 'options', q.question_number)) ?? undefined }
            : o,
        ),
      );
    }

    out.push(next);
  }

  return { questions: out, stored, failed };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = (await request.json().catch(() => null)) as {
      json?: unknown;
      expect_paper_id?: string | null;
      build_test?: boolean;
    } | null;

    const expected = body?.expect_paper_id ?? null;

    // No document at all is a legitimate call: the bulk-upload wizard has
    // already inserted its questions through POST /papers, and only wants the
    // activate-then-build half. It is the same two steps in the same order
    // either way, which is the whole reason they live behind one route.
    if (!body?.json && !expected) {
      return NextResponse.json(
        { error: 'Send the document as { json: ... }, or an expect_paper_id to just build.' },
        { status: 400 },
      );
    }

    // --- 1. Read the document ------------------------------------------------
    const parsed = body?.json ? parsePaperJSON(body.json) : null;
    if (parsed && !parsed.valid) {
      return NextResponse.json(
        { error: parsed.errors[0] || 'That file could not be read.', details: parsed.errors },
        { status: 400 },
      );
    }

    // --- 2. Make sure it is the paper the caller meant ------------------------
    //
    // Without this, opening paper A and picking the file for paper B silently
    // edits B, and the only sign is that A did not change.
    if (expected && parsed?.paper?.id && parsed.paper.id !== expected) {
      return NextResponse.json(
        {
          error: `This file was exported from ${paperTitles({
            exam_type: parsed.paper.exam_type,
            year: parsed.paper.year,
            session: parsed.paper.session ?? null,
            shift: parsed.paper.shift ?? null,
          }).title}, not the paper you have open. Open that paper and upload it there.`,
        },
        { status: 400 },
      );
    }

    if (!expected && !parsed?.paper) {
      return NextResponse.json({ error: REFUSALS.NO_PAPER_IDENTITY }, { status: 400 });
    }

    // --- 3. Inline images ----------------------------------------------------
    const images = parsed
      ? await resolveInlineImages(parsed.questions, access.caller.id)
      : { questions: [], stored: 0, failed: [] as number[] };

    // --- 4. Apply ------------------------------------------------------------
    const applied = await applyPaperJSON({
      paperId: expected,
      identity: parsed?.paper
        ? {
            exam_type: parsed.paper.exam_type,
            year: parsed.paper.year,
            session: parsed.paper.session ?? null,
            shift: parsed.paper.shift ?? null,
          }
        : null,
      meta: parsed?.paper
        ? {
            duration_minutes: parsed.paper.duration_minutes,
            total_marks: parsed.paper.total_marks,
            exam_date: parsed.paper.exam_date,
            pdf_url: parsed.paper.pdf_url,
          }
        : null,
      questions: images.questions,
      callerId: access.caller.id,
    });

    const paperId = applied.paper.id;

    // --- 5. Activate, then build --------------------------------------------
    const buildTest = body?.build_test !== false;
    let activated = 0;
    let test: {
      test_id: string | null;
      title: string | null;
      question_count: number;
      duration_minutes: number | null;
      rebuilt: boolean;
      blocked_by_attempts: number;
    } = {
      test_id: null,
      title: null,
      question_count: 0,
      duration_minutes: null,
      rebuilt: false,
      blocked_by_attempts: 0,
    };

    if (buildTest) {
      activated = (await activatePaperQuestions(paperId)).activated;

      const attempts = await countPaperTestAttempts(paperId);
      if (attempts > 0) {
        const placed = await getPlacedPaperTest(paperId);
        test = {
          test_id: placed?.test_id ?? null,
          title: placed?.title ?? null,
          question_count: placed?.question_count ?? 0,
          duration_minutes: placed?.duration_minutes ?? null,
          rebuilt: false,
          blocked_by_attempts: attempts,
        };
      } else {
        try {
          const built = await generatePaperMockTest({ paperId, createdBy: access.caller.id });
          test = {
            test_id: built.test_id,
            title: built.title,
            question_count: built.question_count,
            duration_minutes: built.duration_minutes,
            rebuilt: true,
            blocked_by_attempts: 0,
          };
        } catch (err) {
          // A paper whose questions could not be activated has nothing to
          // compose. That is worth reporting, not worth losing the import over:
          // the questions are in and the teacher can press Build test later.
          const detail = messageOf(err);
          if (detail !== 'PAPER_HAS_NO_ACTIVE_QUESTIONS') throw err;
          console.warn('[QB Paper Import] nothing active to build a test from:', paperId);
        }
      }
    }

    return NextResponse.json(
      {
        data: {
          paper_id: paperId,
          paper_created: applied.paper_created,
          questions: {
            created: applied.created,
            updated: applied.updated,
            unchanged: applied.unchanged,
            untouched: applied.untouched,
            skipped: applied.skipped,
          },
          images: { stored: images.stored, failed: images.failed },
          unknown_tags: applied.unknown_tags,
          activated,
          test,
          warnings: parsed?.warnings ?? [],
        },
      },
      { status: applied.paper_created ? 201 : 200 },
    );
  } catch (err) {
    const detail = messageOf(err);
    if (REFUSALS[detail]) {
      return NextResponse.json({ error: REFUSALS[detail], code: detail }, { status: 400 });
    }
    console.error('[QB Paper Import] POST:', describeError(err));
    return NextResponse.json({ error: detail || 'That import did not work.' }, { status: 500 });
  }
}
