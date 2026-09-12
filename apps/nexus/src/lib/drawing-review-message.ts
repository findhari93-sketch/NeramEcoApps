/**
 * What a student is told after their drawing is reviewed, and whether they are
 * told at all.
 *
 * Pure so the words can be tested. The review route feeds the result straight to
 * sendNudge: `plain` becomes the Nexus bell row and the Teams activity preview,
 * and `chatHtml` plus `chatAttachment` become a card in the teacher's own 1:1
 * chat with the student, which is why the card speaks in the first person.
 *
 * `fallbackHtml` exists because a card is the part most likely to be refused by
 * Graph. When it is, the chat still gets a plain message with the same link.
 */
import { formatClock } from '../components/video/format';

export type ReviewAction = 'draft' | 'redo' | 'complete';

export function gradeLabel(input: {
  evaluationType: string;
  rating: number | null;
  marks: number | null;
  maxMarks: number;
}): string {
  if (input.evaluationType === 'marks') {
    return input.marks != null ? `${input.marks}/${input.maxMarks} marks` : 'your marks';
  }
  return input.rating ? `${input.rating}/5 stars` : 'a star rating';
}

export interface ReviewMessageInput {
  action: 'redo' | 'complete';
  assignmentTitle: string;
  teacherName: string | null;
  /** Already worded, e.g. "4/5 stars". Only used on Complete. */
  gradeText: string | null;
  /** The reaction's praise, e.g. "Well done!". Only used on Complete. */
  praiseLine: string | null;
  imageUrl: string | null;
  /** Length of the voice note sent with this review, or null when there is none. */
  voiceDurationMs: number | null;
  link: string;
}

export interface ReviewMessage {
  subject: string;
  plain: string;
  teamsText: string;
  buttonLabel: string;
  chatHtml: string;
  chatAttachment: { id: string; contentType: string; content: string };
  fallbackHtml: string;
}

const CARD_ID = 'drawing-review-card';

function firstName(name: string | null): string {
  return String(name || '').trim().split(/\s+/)[0] || 'Your teacher';
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

export function buildReviewMessage(input: ReviewMessageInput): ReviewMessage {
  const who = firstName(input.teacherName);
  const hasVoice = !!input.voiceDurationMs && input.voiceDurationMs > 0;
  const clock = hasVoice ? formatClock((input.voiceDurationMs as number) / 1000) : '';
  const isRedo = input.action === 'redo';

  const subject = isRedo
    ? `Redo requested: ${input.assignmentTitle}`
    : `Assignment reviewed: ${input.assignmentTitle}`;

  const buttonLabel = isRedo
    ? hasVoice
      ? 'Listen and redo'
      : 'See feedback and redo'
    : hasVoice
      ? 'Listen to feedback'
      : 'See feedback';

  const grade = `You got ${input.gradeText || 'your review'}.`;

  const plain = isRedo
    ? hasVoice
      ? `${who} left you a ${clock} voice note about your drawing. Listen to it, then redo your drawing.`
      : `${who} asked you to redo your drawing. Open it to see the feedback.`
    : [grade, input.praiseLine, hasVoice ? `${who} also left you a ${clock} voice note.` : null]
        .filter(Boolean)
        .join(' ');

  // The card is posted AS the teacher, so it speaks as them.
  const cardLine = isRedo
    ? hasVoice
      ? `I left you a ${clock} voice note about your drawing. Listen to it, then redo it.`
      : 'Please redo this drawing. The feedback is waiting for you.'
    : [grade, input.praiseLine, hasVoice ? `I also left you a ${clock} voice note.` : null]
        .filter(Boolean)
        .join(' ');

  const card = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: subject, weight: 'Bolder', size: 'Medium', wrap: true },
      ...(input.imageUrl
        ? [{ type: 'Image', url: input.imageUrl, altText: 'Your drawing', size: 'Stretch' }]
        : []),
      { type: 'TextBlock', text: cardLine, wrap: true },
    ],
    actions: [{ type: 'Action.OpenUrl', title: buttonLabel, url: input.link }],
  };

  const fallbackHtml =
    `<p><b>${escapeHtml(subject)}</b></p>` +
    `<p>${escapeHtml(cardLine)}</p>` +
    `<p><a href="${escapeHtml(input.link)}">${escapeHtml(buttonLabel)}</a></p>`;

  return {
    subject,
    plain,
    teamsText: subject,
    buttonLabel,
    chatHtml: `<attachment id="${CARD_ID}"></attachment>`,
    chatAttachment: {
      id: CARD_ID,
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: JSON.stringify(card),
    },
    fallbackHtml,
  };
}

/**
 * Whether a review action should reach the student at all.
 *
 * - Exam drawings never: the result is embargoed until the exam is published.
 * - Practice drawings with no assignment keep their existing behaviour.
 * - A first review of an attempt always does, Redo included. Redo used to send
 *   nothing, which left students waiting on work they had been asked to redo.
 * - A re-review does only when the outcome changed or a new voice note went out,
 *   so fixing a typo in finished feedback does not ping anybody.
 */
export function shouldNotifyStudent(input: {
  action: ReviewAction;
  previousStatus: string | null;
  hasAssignment: boolean;
  isExam: boolean;
  voiceSentNow: boolean;
}): boolean {
  if (input.action === 'draft' || !input.hasAssignment || input.isExam) return false;
  const wasFinished = input.previousStatus === 'completed' || input.previousStatus === 'reviewed';
  const wasRedo = input.previousStatus === 'redo';
  if (!wasFinished && !wasRedo) return true;
  const outcomeChanged = input.action === 'redo' ? wasFinished : wasRedo;
  return outcomeChanged || input.voiceSentNow;
}
