import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getOriginalPaperWithStats,
  getPaperSections,
  setQuestionSections,
  reclassifyPaperSections,
  qbPaperSectionRuns,
  isQBQuestionSection,
  type QBQuestionFormat,
  type QBQuestionSection,
} from '@neram/database';
import { classifyQuestion } from '@/lib/nta-parser';

/**
 * Which section each question of a paper sits in.
 *
 * Staff only, all three verbs. The section drives marking and the order a
 * scheduled exam is sat in, so this is teacher-owned data and never something
 * a student can reach or influence.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const rows = await getPaperSections(params.id);

    return NextResponse.json({
      data: {
        questions: rows,
        runs: qbPaperSectionRuns(rows),
        unsectioned: rows.filter((r) => !r.section).length,
      },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Sections API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Set the section on specific questions.
 *
 * Body: { updates: [{ question_id, section }] } where section is one of the
 * four known values or null to clear it. Anything else is rejected rather than
 * coerced: a typo that silently becomes 'aptitude' would be a paper marked
 * wrong for the rest of its life.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const raw = Array.isArray(body?.updates) ? body.updates : null;
    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updates: Array<{ question_id: string; section: QBQuestionSection | null }> = [];
    for (const u of raw) {
      if (!u || typeof u.question_id !== 'string' || !u.question_id) {
        return NextResponse.json({ error: 'Every update needs a question_id' }, { status: 400 });
      }
      const section = u.section ?? null;
      if (section !== null && !isQBQuestionSection(section)) {
        return NextResponse.json(
          { error: `"${String(section)}" is not a section on this paper` },
          { status: 400 },
        );
      }
      updates.push({ question_id: u.question_id, section });
    }

    const result = await setQuestionSections(params.id, updates);
    const rows = await getPaperSections(params.id);

    return NextResponse.json({
      data: { ...result, questions: rows, runs: qbPaperSectionRuns(rows) },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Sections API] PATCH Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Re-run the guess over the paper.
 *
 * Defaults to filling only the questions that have no section yet. Passing
 * overwrite: true replaces hand corrections too, which is what a teacher wants
 * after fixing the question numbering and nothing else.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const paper = await getOriginalPaperWithStats(params.id);
    if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const onlyUnset = body?.overwrite !== true;

    // The rule lives in the app (nta-parser), the write lives in the package.
    // Injecting it here is what keeps the parser, this button and the backfill
    // migration agreeing on what a section is.
    const examType = (paper as any).exam_type;
    const result = await reclassifyPaperSections(
      params.id,
      (questionNumber: number, format: QBQuestionFormat) =>
        classifyQuestion(questionNumber, format, examType).section,
      { onlyUnset },
    );

    const rows = await getPaperSections(params.id);

    return NextResponse.json({
      data: { ...result, questions: rows, runs: qbPaperSectionRuns(rows) },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Sections API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
