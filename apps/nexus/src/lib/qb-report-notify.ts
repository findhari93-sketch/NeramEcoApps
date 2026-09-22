/**
 * Telling the students who reported a mistake what came of it.
 *
 * Sent from the teacher who closed it (TEACHER in sender-classification):
 * somebody checked this for these students, and they may want to answer that
 * person, especially when the answer was "it is not a mistake, and here is why".
 */
import type { QBReportOutcome, QBReportTarget } from '@neram/database';
import { plainToHtmlWithLink, sendNudge } from './nudge-delivery';
import { shareBaseUrl } from './class-share-links';

const TARGET_WORDS: Record<QBReportTarget, string> = {
  video: 'video solution',
  explanation: 'written solution',
  solution_image: 'solution image',
  answer_key: 'answer key',
  question: 'question',
};

export interface ReportOutcomeInput {
  studentIds: string[];
  outcome: QBReportOutcome;
  /** The teacher's words. Required for not_a_mistake, optional for fixed. */
  note: string | null;
  target: QBReportTarget;
  partLabel: string | null;
  questionId: string;
  paperLabel: string | null;
  number: number | null;
  teacher: { authHeader: string | null; userId: string };
  /** The request origin, for the link in the chat. */
  origin?: string | null;
}

/** How many deliveries landed (chat, feed and bell together). 0 when nobody was left to tell. */
export async function tellReportersTheOutcome(input: ReportOutcomeInput): Promise<number> {
  if (input.studentIds.length === 0) return 0;

  const where = [
    input.paperLabel,
    input.number != null ? `Q${input.number}` : null,
    input.partLabel ? `part ${input.partLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const what = `${TARGET_WORDS[input.target]}${where ? ` for ${where}` : ''}`;
  const note = input.note?.trim() || '';

  const subject = input.outcome === 'fixed' ? 'Your report was fixed' : 'We checked your report';
  const plain =
    input.outcome === 'fixed'
      ? `Thanks for reporting the ${what}. It has been corrected.${note ? ` ${note}` : ''} Open the question to see it again.`
      : `Thanks for reporting the ${what}. We checked it and it is correct. ${note}`;

  const path = `/student/question-bank/questions/${input.questionId}`;
  const url = `${shareBaseUrl(input.origin ?? null)}${path}`;

  const { counts } = await sendNudge({
    studentIds: input.studentIds,
    subject,
    plain,
    html: plainToHtmlWithLink(plain, url, 'Open the question'),
    eventType: 'qb_report_resolved',
    metadata: { href: path, question_id: input.questionId, outcome: input.outcome, target: input.target },
    teacher: input.teacher,
    source: { kind: 'qb_report_resolved', refId: input.questionId },
  });
  return counts.chat + counts.teams + counts.inapp;
}
