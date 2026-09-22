import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import {
  QB_REPORT_REASONS_BY_TARGET,
  countOpenQBReportsOn,
  countQBReportsSince,
  createQBReport,
  findOpenQBReport,
  getQBReportContext,
  isQBReportTarget,
  qbReportLabel,
  qbReportReasonAllowed,
  solutionRefFor,
  type QBReportSource,
} from '@neram/database';
import { sendNudge } from '@/lib/nudge-delivery';
import { paperQuestionHref } from '@/lib/qb-paper-link';
import { describeError } from '@/lib/api-errors';

/**
 * A student reports a mistake in one part of a question: the video, the
 * written solution, the solution image, the answer key, or the question.
 *
 * Enrolment is enough (verifyQBAccessAnyClassroom). A student reviewing a
 * test must be able to report a wrong video even when the question bank page
 * itself is switched off for them.
 *
 * What the student was looking at is read from the question row here, never
 * taken from the request, so "changed since they reported it" can be trusted.
 */

const NOTE_LIMIT = 500;
const DAILY_LIMIT = 20;
const SOURCES: QBReportSource[] = ['practice', 'test_review', 'drawing'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Targets whose report only makes sense when the question has one. */
const NOTHING_TO_REPORT: Record<string, string> = {
  video: 'This question has no video to report',
  solution_image: 'This question has no solution image to report',
  explanation: 'This question has no written solution to report',
  answer_key: 'This question has no answer key to report',
};

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    const caller = access.caller;
    const { id: questionId } = await params;

    const body = await request.json().catch(() => ({}));
    const target = body?.target;
    const reason = body?.reason;
    if (!isQBReportTarget(target)) return bad('Choose what looks wrong');
    if (typeof reason !== 'string' || !qbReportReasonAllowed(target, reason)) {
      return bad('Choose a reason from the list');
    }

    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > NOTE_LIMIT) return bad(`Keep the note under ${NOTE_LIMIT} characters`);
    if (reason === 'other' && !note) return bad('Tell us what looks wrong in a few words');

    const partLabel =
      typeof body.part_label === 'string' && body.part_label.trim() ? body.part_label.trim().slice(0, 4) : null;
    const videoSeconds =
      target === 'video' && Number.isInteger(body.video_seconds) && body.video_seconds >= 0
        ? (body.video_seconds as number)
        : null;
    const source: QBReportSource = SOURCES.includes(body.source) ? body.source : 'practice';
    const testId = typeof body.test_id === 'string' && UUID.test(body.test_id) ? body.test_id : null;

    const context = await getQBReportContext(questionId);
    if (!context) return bad('Question not found', 404);
    const { question, paper } = context;

    const option = QB_REPORT_REASONS_BY_TARGET[target].find((o) => o.reason === reason);
    if (option?.mcqOnly && question.question_format !== 'MCQ') return bad('Choose a reason from the list');

    const solutionRef = solutionRefFor(question, target, partLabel);
    if (!solutionRef && NOTHING_TO_REPORT[target]) return bad(NOTHING_TO_REPORT[target]);

    const existing = await findOpenQBReport(caller.id, questionId, target, partLabel);
    if (existing) return NextResponse.json({ data: existing, already_open: true }, { status: 200 });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if ((await countQBReportsSince(caller.id, since)) >= DAILY_LIMIT) {
      return bad(`You have sent ${DAILY_LIMIT} reports today. Try again tomorrow.`, 429);
    }

    // Counted before the insert: zero means this report is the first.
    const openBefore = await countOpenQBReportsOn(questionId, target, partLabel);

    const report = await createQBReport({
      question_id: questionId,
      student_id: caller.id,
      report_type: reason,
      target,
      description: note || null,
      part_label: partLabel,
      solution_ref: solutionRef,
      video_seconds: videoSeconds,
      source,
      test_id: testId,
    });

    if (openBefore === 0 && paper?.uploaded_by && paper.uploaded_by !== caller.id) {
      await alertUploader({
        uploaderId: paper.uploaded_by,
        paperId: paper.id,
        paperLabel: paper.label,
        questionId,
        number: question.display_order,
        headline: qbReportLabel(target, reason),
        partLabel,
        note,
        target,
      });
    }

    return NextResponse.json({ data: report, already_open: false }, { status: 201 });
  } catch (err) {
    console.error('[QB API] Report creation error:', describeError(err));
    return bad('That did not send. Try again in a moment.', 500);
  }
}

/**
 * A bell for the teacher who uploaded the paper. Bell only, no Teams ping:
 * more reports on the same part raise the badge, not another alert. A failure
 * here is logged and swallowed, because losing the student's report over a
 * notification would be the worse outcome.
 */
async function alertUploader(input: {
  uploaderId: string;
  paperId: string;
  paperLabel: string;
  questionId: string;
  number: number | null;
  headline: string;
  partLabel: string | null;
  note: string;
  target: string;
}) {
  const where = `${input.paperLabel}${input.number != null ? ` Q${input.number}` : ''}${input.partLabel ? ` part ${input.partLabel}` : ''}`;
  try {
    await sendNudge({
      studentIds: [input.uploaderId],
      audience: 'staff',
      bellOnly: true,
      subject: `A student reported a mistake in ${where}`,
      plain: input.note ? `${input.headline}. "${input.note}"` : `${input.headline}.`,
      eventType: 'qb_solution_reported',
      metadata: {
        href: paperQuestionHref(input.paperId, input.questionId, input.target === 'video' ? 'videos' : 'edit'),
        question_id: input.questionId,
        paper_id: input.paperId,
        target: input.target,
      },
      source: { kind: 'qb_report', refId: input.questionId },
    });
  } catch (err) {
    console.error('[QB API] Report alert failed:', describeError(err));
  }
}
