/**
 * A link straight to one question of a paper, opened in its side pane.
 *
 * The paper page held the open question in React state only, so a report, a
 * bell or a test health row could say "Q31 of JEE Paper 2 2015" but never take
 * a teacher there. `?q=` opens the question; `?mode=` picks the list mode, so a
 * video report lands in Videos mode, where the link is actually replaced.
 * `?stage=` is the exam page card the paper was opened from, so Back returns
 * to the same list ("Done") instead of the default one.
 */
export type PaperLinkMode = 'edit' | 'images' | 'videos';

const MODES: PaperLinkMode[] = ['edit', 'images', 'videos'];

export function paperQuestionHref(paperId: string, questionId: string, mode?: PaperLinkMode): string {
  const params = new URLSearchParams({ q: questionId });
  if (mode) params.set('mode', mode);
  return `/teacher/question-bank/papers/${paperId}?${params.toString()}`;
}

/** The paper, opened from an exam page card, remembering the card for Back. */
export function paperHref(paperId: string, fromStage?: string | null): string {
  const base = `/teacher/question-bank/papers/${paperId}`;
  return fromStage ? `${base}?${new URLSearchParams({ stage: fromStage }).toString()}` : base;
}

/** Where the paper page's Back goes: its exam page, on the card it came from. */
export function paperBackHref(examPath: string, fromStage: string | null): string {
  return fromStage ? `${examPath}?${new URLSearchParams({ stage: fromStage }).toString()}` : examPath;
}

/**
 * `stage` comes back raw: the caller validates it against the exam page's
 * stages (isWorkStage), which this module does not import.
 */
export function readPaperDeepLink(params: URLSearchParams | null | undefined): {
  questionId: string | null;
  mode: PaperLinkMode | null;
  stage: string | null;
} {
  const questionId = params?.get('q') || null;
  const mode = params?.get('mode') as PaperLinkMode | null;
  return { questionId, mode: mode && MODES.includes(mode) ? mode : null, stage: params?.get('stage') || null };
}
