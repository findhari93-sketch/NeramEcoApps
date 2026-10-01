/**
 * The questions Present to class steps through, in order, each with the
 * label every screen calls it by ("38" reads Q.38 on the pad) and what the
 * class sees. No answers: the deck is drawn on a shared screen, so it never
 * carries the key, the explanation or an option's is_correct.
 *
 * PURE: no React, no database.
 */

import type { NexusQBQuestionListItem, NexusQBQuestionSource } from '@neram/database';
import { displayNumbers, sortForPaper, type PaperContext } from '@/lib/qb-paper-number';
import { answerPlan, type AnswerPlan } from './answer-plan';

export interface DeckSourceQuestion {
  id: string;
  question_format: string | null;
  question_text: string | null;
  question_image_url: string | null;
  options: unknown;
  correct_answer: string | null;
  display_order: number | null;
  section: string | null;
  section_order: number | null;
  drawing_parts?: unknown;
  sources?: NexusQBQuestionSource[] | null;
}

export interface DeckOption {
  text: string | null;
  image_url: string | null;
}

export interface DeckPart {
  label: string | null;
  text: string | null;
  image_url: string | null;
}

export interface DeckItem {
  id: string;
  /** What the pad and every screen call it: "38" (Q.38), or "2019 Q12" for a mixed list. */
  label: string;
  section: string | null;
  format: string;
  text: string | null;
  image_url: string | null;
  options: DeckOption[];
  /** A drawing question's parts (stem and items), without their solutions. */
  parts: DeckPart[];
  /** How it is asked: the buttons, and whether the bank has an answer Reveal can use. */
  plan: { type: AnswerPlan['type']; optionCount: number | null; hasKey: boolean };
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

function deckOptions(options: unknown): DeckOption[] {
  if (!Array.isArray(options)) return [];
  return options
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => ({ text: str(o.text), image_url: str(o.image_url) }));
}

function deckParts(parts: unknown): DeckPart[] {
  const items = parts && typeof parts === 'object' ? (parts as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return [];
  return items
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({ label: str(p.label), text: str(p.text), image_url: str(p.image_url) }));
}

function planSummary(plan: AnswerPlan): DeckItem['plan'] {
  if (plan.type === 'show') return { type: 'show', optionCount: null, hasKey: false };
  return { type: plan.type, optionCount: plan.type === 'mcq' ? plan.optionCount : null, hasKey: !!plan.keys?.length };
}

function toItem(q: DeckSourceQuestion, label: string): DeckItem {
  return {
    id: q.id,
    label,
    section: q.section,
    format: q.question_format ?? 'MCQ',
    text: q.question_text,
    image_url: q.question_image_url,
    options: deckOptions(q.options),
    parts: deckParts(q.drawing_parts),
    plan: planSummary(answerPlan(q)),
  };
}

/** A paper, in paper order, labelled with the paper's own numbers. */
/** The fields the paper numbering reads, typed as it expects them. */
type Numbered = DeckSourceQuestion & Pick<NexusQBQuestionListItem, 'id' | 'sources' | 'display_order' | 'section' | 'section_order'>;

export function paperDeck(questions: DeckSourceQuestion[], ctx: PaperContext): DeckItem[] {
  const ordered = sortForPaper(questions as Numbered[], ctx);
  const numbers = displayNumbers(ordered, ctx);
  return ordered.map((q, idx) => toItem(q, String(numbers.get(q.id) ?? idx + 1)));
}

/**
 * A list the teacher picked, in the order given. A question from one paper is
 * called by that paper ("2019 Q12"), so the class can find it in print;
 * otherwise by its place in the list.
 */
export function listDeck(questions: DeckSourceQuestion[], order: string[]): DeckItem[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return order
    .map((id) => byId.get(id))
    .filter((q): q is DeckSourceQuestion => !!q)
    .map((q, idx) => {
      const numbered = (q.sources ?? []).filter((s) => s.question_number != null);
      const label = numbered.length === 1 ? `${numbered[0].year} Q${numbered[0].question_number}` : String(idx + 1);
      return toItem(q, label);
    });
}

/** The name on the presenter's top strip: "JEE 2025 Paper 2", "NATA 2025 S1". */
export function paperTitle(paper: { exam_type: string; year: number; session?: string | null; shift?: string | null }): string {
  const exam = paper.exam_type === 'JEE_PAPER_2' ? 'JEE Paper 2' : paper.exam_type === 'NATA' ? 'NATA' : paper.exam_type;
  const session = paper.session ? ` ${paper.session.trim().match(/^\d+$/) ? `S${paper.session.trim()}` : paper.session.trim()}` : '';
  const shift = paper.shift ? ` (${paper.shift === 'forenoon' ? 'forenoon' : paper.shift === 'afternoon' ? 'afternoon' : paper.shift})` : '';
  return `${exam} ${paper.year}${session}${shift}`;
}
