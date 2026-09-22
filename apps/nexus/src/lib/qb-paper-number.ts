/**
 * Which paper a student is practising, and what each question is called in it.
 *
 * The practice list used to label questions by their position on the page, so
 * page 2 restarted at Q1 and "Q18" on screen was rarely question 18 of the
 * paper. A student comparing notes with the printed paper, or a teacher saying
 * "look at 18", could not find it. The paper's own number lives on the source
 * row (nexus_qb_question_sources.question_number) and, for questions imported
 * from a paper, on display_order.
 *
 * PURE: no React.
 */

import type { NexusQBQuestionListItem, NexusQBQuestionSource } from '@neram/database';

/**
 * How much of the bank the practice screen is showing.
 *
 * - `paper`: one exam in one year (optionally one session or sitting). Small
 *   enough to load whole, and numbered the way the printed paper is.
 * - `exam`: every year of one exam. Can run to hundreds of questions.
 * - `bank`: no exam at all.
 */
export type PracticeScope = 'paper' | 'exam' | 'bank';

export interface PaperContext {
  exam: string | null;
  year: number | null;
  session: string | null;
  shift: string | null;
}

export function practiceScopeOf(ctx: PaperContext): PracticeScope {
  if (ctx.exam && ctx.year) return 'paper';
  if (ctx.exam) return 'exam';
  return 'bank';
}

/**
 * The source row that places this question in the paper being practised.
 *
 * A repeated question carries one source per paper it appeared in, and its
 * number differs between them (2014 Q18 may be 2019 Q41), so the first source
 * is not good enough: it has to be the one matching the paper on screen.
 */
export function matchingSource(
  sources: NexusQBQuestionSource[] | null | undefined,
  ctx: PaperContext,
): NexusQBQuestionSource | null {
  if (!sources?.length) return null;
  const matches = sources.filter(
    (s) =>
      (!ctx.exam || s.exam_type === ctx.exam) &&
      (!ctx.year || s.year === ctx.year) &&
      (!ctx.session || s.session === ctx.session) &&
      (!ctx.shift || s.shift === ctx.shift),
  );
  return matches.find((s) => s.question_number != null) ?? matches[0] ?? null;
}

/**
 * The question's number in the paper on screen, or null when it has none.
 *
 * Outside a paper there is no printed number to show, so null tells the caller
 * to fall back to the position in the list.
 */
export function paperNumberOf(
  item: Pick<NexusQBQuestionListItem, 'sources' | 'display_order'>,
  ctx: PaperContext,
): number | null {
  if (practiceScopeOf(ctx) !== 'paper') return null;
  const source = matchingSource(item.sources, ctx);
  if (source?.question_number != null) return source.question_number;
  return item.display_order ?? null;
}

/**
 * The label for every question in a list: its paper number where it has one,
 * its 1-based position otherwise.
 *
 * Paper numbers are only used when they name one question each within a
 * section. A year with several sittings (NATA 2025 has April 9, April 21 and
 * March 13) numbers each sitting from 1, so the year as a whole has three
 * question 2s; a grid reading "2 2 2" helps nobody. Then the whole list is
 * numbered by position instead, which is at least unambiguous.
 */
export function displayNumbers(
  items: Pick<NexusQBQuestionListItem, 'id' | 'sources' | 'display_order' | 'section'>[],
  ctx: PaperContext,
): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  let collision = false;
  items.forEach((item, idx) => {
    const n = paperNumberOf(item, ctx);
    if (n != null) {
      const key = `${item.section ?? ''}#${n}`;
      if (seen.has(key)) collision = true;
      seen.add(key);
    }
    out.set(item.id, n ?? idx + 1);
  });
  if (collision) items.forEach((item, idx) => out.set(item.id, idx + 1));
  return out;
}

/**
 * Paper order: section first, then the number within it.
 *
 * The list endpoint sorts by display_order alone, which interleaves sections on
 * a paper whose numbering restarts per section. Stable, so questions with
 * neither key keep the order the server sent.
 */
export function sortForPaper<T extends Pick<NexusQBQuestionListItem, 'sources' | 'display_order' | 'section_order'>>(
  items: T[],
  ctx: PaperContext,
): T[] {
  const keyed = items.map((item, idx) => ({
    item,
    idx,
    section: item.section_order ?? Number.POSITIVE_INFINITY,
    // A year of several sittings keeps each sitting together inside a section.
    sitting: matchingSource(item.sources, ctx)?.session ?? '',
    number: paperNumberOf(item, ctx) ?? Number.POSITIVE_INFINITY,
  }));
  keyed.sort(
    (a, b) => a.section - b.section || a.sitting.localeCompare(b.sitting) || a.number - b.number || a.idx - b.idx,
  );
  return keyed.map((k) => k.item);
}

/**
 * Where a question came from, for a list that spans papers: "JEE 2014 Q18".
 *
 * Used in the exam and bank scopes, where a row has no paper number of its own
 * and the year is the most useful thing to know about it.
 */
export function sourceLabel(item: Pick<NexusQBQuestionListItem, 'sources'>): string | null {
  const source = item.sources?.[0];
  if (!source) return null;
  const exam = source.exam_type === 'JEE_PAPER_2' ? 'JEE' : 'NATA';
  const session = source.session ? ` S${source.session}` : '';
  const number = source.question_number != null ? ` Q${source.question_number}` : '';
  return `${exam} ${source.year}${session}${number}`;
}
