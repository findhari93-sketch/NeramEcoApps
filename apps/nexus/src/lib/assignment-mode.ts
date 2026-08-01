/**
 * What a student actually does with an assignment.
 *
 * The form used to open with "Drawing or Document", which is a question about
 * storage, not about work. A teacher looking for multiple choice had no reason
 * to think either answer led there, and in fact the question composer only
 * appeared one screen later behind a button reading "Create and add the paper",
 * where "paper" reads as a PDF you upload. So the feature existed and nobody
 * could find it.
 *
 * Naming the three modes by what the student does puts MCQ and numerical on the
 * very first screen, before anything is committed.
 *
 * Deliberately NOT a column. The mode is a view over two facts the database
 * already holds, so it can never disagree with them:
 *
 *   assignment_type = 'drawing'          -> 'drawing'
 *   'document' with questions attached   -> 'questions'
 *   'document' with none                 -> 'upload'
 *
 * That also makes the mode a starting shape rather than a lock. A teacher who
 * picks "Solve and upload" and later adds a question moves the assignment to
 * "Answer questions" by doing so, with nothing to migrate and no way to end up
 * in a state the picker claims is impossible.
 *
 * Pure and framework-free, like assignment-format.ts and
 * assignment-submit-window.ts beside it.
 */

export type AssignmentType = 'drawing' | 'document';

/**
 * 'questions' - answered in the app, marked instantly, working optional.
 * 'upload'    - a PDF or photos, marked by the teacher.
 * 'drawing'   - a sketch, reviewed in the Drawing Review channel.
 */
export type AssignmentMode = 'questions' | 'upload' | 'drawing';

export interface AssignmentModeMeta {
  mode: AssignmentMode;
  title: string;
  /** One line under the title. Says what happens, not what it is called. */
  blurb: string;
}

/**
 * The picker's copy, in the order it is shown.
 *
 * "Answer questions" is first on purpose: it is the mode teachers could not find,
 * and the one where the app does the most work for them.
 */
export const ASSIGNMENT_MODES: AssignmentModeMeta[] = [
  {
    mode: 'questions',
    title: 'Answer questions',
    blurb: 'Multiple choice and numerical, marked the moment they submit',
  },
  {
    mode: 'upload',
    title: 'Solve and upload',
    blurb: 'They hand in a PDF or photos, you mark it',
  },
  {
    mode: 'drawing',
    title: 'Drawing task',
    blurb: 'A sketch, reviewed in the drawing channel',
  },
];

/** The mode an existing assignment is already in. */
export function resolveAssignmentMode(
  assignmentType: AssignmentType,
  questionCount: number,
): AssignmentMode {
  if (assignmentType === 'drawing') return 'drawing';
  return questionCount > 0 ? 'questions' : 'upload';
}

/** Which of the two stored types a chosen mode writes. */
export function assignmentTypeForMode(mode: AssignmentMode): AssignmentType {
  return mode === 'drawing' ? 'drawing' : 'document';
}

/** Whether this mode has a question paper to author. */
export function modeWantsQuestions(mode: AssignmentMode): boolean {
  return mode === 'questions';
}

/**
 * Whether switching to `next` is allowed on an assignment that already exists.
 *
 * Crossing the drawing boundary is refused, and this is not cosmetic: a drawing
 * owns a backing `drawing_question_id` and its submissions live in a different
 * table entirely, so a swap would strand any work already handed in. The two
 * document modes swap freely, because the only difference between them is
 * whether a paper is attached.
 *
 * Returns a sentence to show, or null when the switch is fine.
 */
export function modeSwitchBlockedReason(
  current: AssignmentMode,
  next: AssignmentMode,
): string | null {
  if (current === next) return null;
  if (current === 'drawing') {
    return 'This is a drawing task. Students submit photos that are reviewed in the drawing channel, so it cannot become a written assignment. Create a new one instead.';
  }
  if (next === 'drawing') {
    return 'A written assignment cannot become a drawing task, because drawings are reviewed in a different place. Create a new one instead.';
  }
  return null;
}

/**
 * The default grading scale for a mode.
 *
 * Drawings are judged, not totted up, so they start on stars. Written work
 * starts on marks. Either can be changed; this only decides where the toggle
 * begins.
 */
export function defaultEvaluationForMode(mode: AssignmentMode): 'marks' | 'stars' {
  return mode === 'drawing' ? 'stars' : 'marks';
}
