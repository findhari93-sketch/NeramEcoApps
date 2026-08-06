/**
 * The mock test on one original paper.
 *
 * Mirrors api/study-materials/files/[id]/test, deliberately: a paper's mock and
 * a chapter's test are the same idea placed at a different context, and keeping
 * the two routes the same shape means whoever fixes one can read the other.
 *
 * POST does both ways of getting a mock. Sending { generate: true } builds one
 * from the paper's own active questions; sending { test_id } attaches a test the
 * teacher already authored. They are one route because the panel offers them as
 * one choice, and because both end in the same placement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  generatePaperMockTest,
  getPlacedPaperTest,
  linkTestToQBPaper,
  unlinkTestFromQBPaper,
} from '@neram/database';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    return NextResponse.json({ data: await getPlacedPaperTest(params.id) });
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Paper Test] GET:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}

/** Human wording for the engine's sentinel errors, so the panel never shows a code. */
const REFUSALS: Record<string, string> = {
  TEST_NOT_FOUND: 'That test no longer exists.',
  TEST_HAS_NO_QUESTIONS: 'That test holds no questions yet.',
  PAPER_NOT_FOUND: 'This paper no longer exists.',
  PAPER_HAS_NO_ACTIVE_QUESTIONS:
    'This paper has no active questions yet. Activate its questions first, then generate the test.',
  LINK_FAILED: 'The test could not be attached. Try again.',
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const body = (await request.json().catch(() => ({}))) as {
      generate?: boolean;
      test_id?: string;
      passing_pct?: number | null;
    };

    const placed = body.generate
      ? await generatePaperMockTest({
          paperId: params.id,
          createdBy: access.caller.id,
          passingPct: body.passing_pct ?? null,
        })
      : body.test_id
        ? await linkTestToQBPaper({
            paperId: params.id,
            testId: body.test_id,
            passingPct: body.passing_pct ?? null,
            createdBy: access.caller.id,
          })
        : null;

    if (!placed) {
      return NextResponse.json(
        { error: 'Send either generate: true or a test_id.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ data: placed }, { status: 201 });
  } catch (err) {
    const detail = messageOf(err);
    if (REFUSALS[detail]) {
      return NextResponse.json({ error: REFUSALS[detail], code: detail }, { status: 400 });
    }
    console.error('[QB Paper Test] POST:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    // Soft. The test and every attempt against it survive, so detaching a mock
    // by mistake loses no student's score.
    await unlinkTestFromQBPaper(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Paper Test] DELETE:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}
