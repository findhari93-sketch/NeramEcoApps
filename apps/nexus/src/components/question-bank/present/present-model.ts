/**
 * What Present to class shows for the question on screen, worked out from the
 * deck item and the teacher's pad snapshot.
 *
 * The presenter is drawn on a shared screen, so this is also where the rule
 * "no answer before Reveal" lives: revealedKeys is filled only for a revealed
 * prompt, and nothing else here carries a key.
 *
 * PURE: no React.
 */

import type { HistoryEntry, PromptState, TeacherSnapshot } from '@/lib/pad/client/types';
import type { DeckItem } from '@/lib/qb-present/deck';

export type PresentPhase = 'ready' | PromptState;

export type PrimaryAction = 'start' | 'close' | 'reveal' | 'next' | 'none';

/** The pad as the presenter sees it. */
export type PadLink =
  | { kind: 'checking' }
  /** The Answer Pad is switched off for this teacher, or they chose to present without it. */
  | { kind: 'off' }
  /** On, but no live session yet. */
  | { kind: 'none' }
  | { kind: 'live'; sessionId: string };

export interface StageView {
  phase: PresentPhase;
  primary: PrimaryAction;
  /** The prompt asking this question, when it has been asked. */
  promptId: string | null;
  /** The newest prompt is this question: live counts and the answer spread belong to it. */
  isCurrentPrompt: boolean;
  /** Answers stop at this time (server clock); only while open. */
  closesAt: string | null;
  timeLimit: number | null;
  answered: number | null;
  joined: number | null;
  /** How the class answered, once closed: value to count. Only for the newest prompt. */
  distribution: Array<{ value: string; count: number }> | null;
  /** The answer, ONLY once revealed. */
  revealedKeys: string[] | null;
  /** Reveal can grade: the teacher chose a key, the bank had one, or it is a poll. */
  canReveal: boolean;
  /** Something else is open on the pad (asked from the Teams console): its title. */
  otherOpen: { promptId: string; label: string | null; sequence: number } | null;
}

/** The newest prompt that asked this question. */
function promptFor(item: DeckItem, snapshot: TeacherSnapshot | null): HistoryEntry | null {
  if (!snapshot) return null;
  for (let i = snapshot.history.length - 1; i >= 0; i -= 1) {
    if (snapshot.history[i].qb_question_id === item.id) return snapshot.history[i];
  }
  return null;
}

export function stageView(item: DeckItem, snapshot: TeacherSnapshot | null, pad: PadLink, isLast: boolean): StageView {
  const entry = promptFor(item, snapshot);
  const current = snapshot?.prompt && entry && snapshot.prompt.id === entry.id ? snapshot.prompt : null;
  const phase: PresentPhase = current?.state ?? entry?.state ?? 'ready';

  const openPrompt = snapshot?.prompt && snapshot.prompt.state === 'open' ? snapshot.prompt : null;
  const otherOpen =
    openPrompt && openPrompt.id !== entry?.id
      ? { promptId: openPrompt.id, label: openPrompt.label, sequence: openPrompt.sequence }
      : null;

  const canAsk = pad.kind === 'live' && item.plan.type !== 'show';
  const canReveal = current
    ? current.ungraded || !!current.correct_keys?.length || !!current.suggested_keys?.length
    : !!entry && (entry.ungraded || !!entry.correct_keys?.length || item.plan.hasKey);

  let primary: PrimaryAction;
  switch (phase) {
    case 'ready':
      primary = canAsk ? 'start' : isLast ? 'none' : 'next';
      break;
    case 'open':
      primary = 'close';
      break;
    case 'closed':
      primary = 'reveal';
      break;
    case 'revealed':
      primary = isLast ? 'none' : 'next';
      break;
  }

  const counts = current ? snapshot?.counts ?? null : null;
  const joined = counts?.joined ?? null;
  return {
    phase,
    primary,
    promptId: entry?.id ?? null,
    isCurrentPrompt: !!current,
    closesAt: phase === 'open' ? current?.closes_at ?? null : null,
    timeLimit: current?.time_limit_s ?? null,
    answered: current ? (joined ? counts?.answered_joined ?? 0 : current.answered_count) : entry ? entry.answered : null,
    joined: joined || null,
    distribution: current && phase !== 'open' ? snapshot?.groups ?? [] : null,
    revealedKeys: phase === 'revealed' ? (current?.correct_keys ?? entry?.correct_keys ?? null) : null,
    canReveal,
    otherOpen,
  };
}

/** Where each question stands, for the question grid. */
export type GridStatus = { state: 'new' } | { state: 'asked' } | { state: 'revealed'; percent: number | null };

export function gridStatuses(items: DeckItem[], snapshot: TeacherSnapshot | null): Map<string, GridStatus> {
  const latest = new Map<string, HistoryEntry>();
  for (const entry of snapshot?.history ?? []) {
    if (entry.qb_question_id) latest.set(entry.qb_question_id, entry);
  }
  const out = new Map<string, GridStatus>();
  for (const item of items) {
    const entry = latest.get(item.id);
    if (!entry) out.set(item.id, { state: 'new' });
    else if (entry.state !== 'revealed') out.set(item.id, { state: 'asked' });
    else {
      const percent = !entry.ungraded && entry.answered > 0 ? Math.round((entry.correct / entry.answered) * 100) : null;
      out.set(item.id, { state: 'revealed', percent });
    }
  }
  return out;
}

const LETTERS = 'ABCDEF';

/** The option letter for each position: A, B, C... */
export const optionLetter = (index: number): string => LETTERS.charAt(index);

/** Positions of the revealed MCQ answer. Empty before Reveal, always. */
export function correctIndexes(view: Pick<StageView, 'revealedKeys'>): Set<number> {
  const out = new Set<number>();
  for (const key of view.revealedKeys ?? []) {
    const index = LETTERS.indexOf(key.toUpperCase());
    if (index >= 0) out.add(index);
  }
  return out;
}

/** How many chose each option letter, and the total answered, for the spread bars. */
export function optionCounts(view: Pick<StageView, 'distribution'>, optionCount: number): { counts: number[]; total: number } | null {
  if (!view.distribution) return null;
  const counts = Array.from({ length: optionCount }, () => 0);
  let total = 0;
  for (const group of view.distribution) {
    total += group.count;
    const index = LETTERS.indexOf(group.value.toUpperCase());
    if (index >= 0 && index < optionCount) counts[index] += group.count;
  }
  return { counts, total };
}

/** Exit goes back where the teacher came from, and only ever inside the teacher app. */
export function safeBackHref(back: string | null | undefined, paperId: string | null): string {
  if (back && /^\/teacher\/[\w\-/?=&%.]*$/.test(back) && !back.startsWith('//')) return back;
  return paperId ? `/teacher/question-bank/papers/${paperId}` : '/teacher/question-bank';
}
