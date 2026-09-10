/**
 * What a teacher says to students about one run of a test.
 *
 * PURE, and separate from the route, for two reasons. The dialog renders the
 * same wording live as the teacher picks a template, so the two cannot show one
 * thing and send another. And the route re-renders the chosen template
 * server-side rather than trusting whatever the browser posts, which is the same
 * rule the class and assignment share routes follow: choices cross the wire,
 * markup never does.
 *
 * Two kinds of placeholder, and the difference matters:
 *   - CONSTANT across the batch: {test}, {pass_mark}, {due}. Substituted here,
 *     once, by fillConstants.
 *   - PER RECIPIENT: {name}, {score}. Left in the text and substituted by
 *     sendNudge, which is the only thing that knows who is actually reachable.
 */

export type TestMessageTemplate = 'redo' | 'missed' | 'why' | 'regraded' | 'custom';

export const TEST_MESSAGE_TEMPLATES: TestMessageTemplate[] = [
  'redo',
  'missed',
  'why',
  'regraded',
  'custom',
];

export function isTestMessageTemplate(v: unknown): v is TestMessageTemplate {
  return typeof v === 'string' && (TEST_MESSAGE_TEMPLATES as string[]).includes(v);
}

/** What the teacher would call each one in the picker. */
export const TEMPLATE_LABELS: Record<TestMessageTemplate, string> = {
  redo: 'Redo this test',
  missed: 'You missed this',
  why: 'Tell me why',
  regraded: 'Score changed',
  custom: 'Write my own',
};

export interface TestMessageContext {
  testTitle: string;
  /** Percentage, or null when the run has no pass mark. */
  passMark: number | null;
  /** Already formatted for reading, e.g. "18 Aug". Null when the run has no date. */
  dueLabel: string | null;
  /** Whether the teacher is also reopening the run in the same press. */
  reopening: boolean;
}

export interface RenderedMessage {
  subject: string;
  body: string;
}

/**
 * The reopen sentence, which changes meaning completely with the checkbox.
 *
 * Promising a reopen that did not happen is the single most damaging thing this
 * feature could say: the student goes to Nexus, finds the door shut, and stops
 * believing the messages.
 */
function reopenLine(reopening: boolean): string {
  return reopening
    ? 'I have reopened the test for you, so you can start it whenever you are ready.'
    : 'Ask me to reopen it and I will open it for you.';
}

export function renderTestMessage(
  template: TestMessageTemplate,
  ctx: TestMessageContext,
): RenderedMessage {
  const pass = ctx.passMark == null ? null : `${Math.round(ctx.passMark)}%`;

  switch (template) {
    case 'redo':
      return {
        subject: `Please redo: ${ctx.testTitle}`,
        body: [
          'Hi {name},',
          '',
          pass
            ? `You scored {score} on {test}, and the pass mark is {pass_mark}.`
            : `You scored {score} on {test}, and I would like you to try again.`,
          '',
          reopenLine(ctx.reopening),
          '',
          'If something went wrong the first time, reply and tell me what happened.',
        ].join('\n'),
      };

    case 'missed':
      return {
        subject: `You have not done: ${ctx.testTitle}`,
        body: [
          'Hi {name},',
          '',
          ctx.dueLabel
            ? 'You have not sat {test}, which was due on {due}.'
            : 'You have not sat {test} yet.',
          '',
          reopenLine(ctx.reopening),
          '',
          'If you could not sit it for a reason, reply and let me know.',
        ].join('\n'),
      };

    case 'why':
      return {
        subject: `About ${ctx.testTitle}`,
        body: [
          'Hi {name},',
          '',
          'I noticed you have not completed {test}.',
          '',
          // Deliberately points at the in-app ask rather than only inviting a
          // reply: a reason typed there lands on the request as student_note,
          // which is where the teacher answering it will actually be looking.
          'Before I reopen it, tell me what happened. Reply here, or open the test',
          'in Nexus and use "Ask to reopen" so your reason reaches me with the request.',
        ].join('\n'),
      };

    case 'regraded':
      return {
        subject: `Your score changed: ${ctx.testTitle}`,
        body: [
          'Hi {name},',
          '',
          'One of the questions on {test} had the wrong option marked as correct.',
          'I have corrected it and re-marked every paper.',
          '',
          'Your score is now {score}. It changed because of the correction, not',
          'because of anything you did.',
        ].join('\n'),
      };

    case 'custom':
    default:
      return { subject: '', body: '' };
  }
}

/**
 * Fill in everything that is the same for every recipient.
 *
 * Leaves {name} and {score} alone on purpose. An unknown placeholder is left
 * exactly as written rather than blanked, so a typo shows up on screen instead
 * of silently eating half a sentence.
 */
export function fillConstants(text: string, ctx: TestMessageContext): string {
  if (!text) return text;
  const values: Record<string, string> = {
    test: ctx.testTitle,
    pass_mark: ctx.passMark == null ? 'the pass mark' : `${Math.round(ctx.passMark)}%`,
    due: ctx.dueLabel || 'the due date',
  };
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

/**
 * The group post body.
 *
 * Says what it is and how many people it is for, and stops. The names come from
 * sendNudge, built from the students actually reached, so this text must never
 * try to list them itself: a hand-built list here and a mention list there is
 * two sources of truth for the same sentence.
 */
export function renderGroupPostHtml(input: {
  testTitle: string;
  count: number;
  reopening: boolean;
  /** The teacher's own words, plain text. Escaped by the caller before it arrives. */
  bodyHtml: string;
}): string {
  const who = `${input.count} student${input.count === 1 ? '' : 's'}`;
  const head = input.reopening
    ? `<p><b>${input.testTitle}</b> has been reopened for ${who}.</p>`
    : `<p>A message about <b>${input.testTitle}</b>, for ${who}.</p>`;
  return `${head}<p>${input.bodyHtml}</p>`;
}
