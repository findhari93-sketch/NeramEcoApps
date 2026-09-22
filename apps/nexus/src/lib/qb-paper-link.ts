/**
 * A link straight to one question of a paper, opened in its side pane.
 *
 * The paper page held the open question in React state only, so a report, a
 * bell or a test health row could say "Q31 of JEE Paper 2 2015" but never take
 * a teacher there. `?q=` opens the question; `?mode=` picks the list mode, so a
 * video report lands in Videos mode, where the link is actually replaced.
 */
export type PaperLinkMode = 'edit' | 'images' | 'videos';

const MODES: PaperLinkMode[] = ['edit', 'images', 'videos'];

export function paperQuestionHref(paperId: string, questionId: string, mode?: PaperLinkMode): string {
  const params = new URLSearchParams({ q: questionId });
  if (mode) params.set('mode', mode);
  return `/teacher/question-bank/papers/${paperId}?${params.toString()}`;
}

export function readPaperDeepLink(params: URLSearchParams | null | undefined): {
  questionId: string | null;
  mode: PaperLinkMode | null;
} {
  const questionId = params?.get('q') || null;
  const mode = params?.get('mode') as PaperLinkMode | null;
  return { questionId, mode: mode && MODES.includes(mode) ? mode : null };
}
