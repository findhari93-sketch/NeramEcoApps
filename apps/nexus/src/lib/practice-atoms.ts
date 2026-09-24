import type { NexusQBQuestionListItem } from '@neram/database';
import { readDrawingParts } from './drawing-parts';

/**
 * One thing a student practises.
 *
 * For almost every question that is the question. For a drawing printed as
 * "attempt any one of two" it is one option: JEE 2014 Q81 is "draw a frame of
 * cubes and cones" OR "rotate the graphic below", two unrelated tasks that
 * happen to share a number because the exam lets you pick one.
 *
 * Practice is not the exam. A student wants to draw both, on different days,
 * and see each one's own figure, its own solution and its own attempt. Sharing
 * one row gave them one upload button between two questions and printed 81B's
 * graphic above 81A.
 *
 * The paper is left alone: the question keeps its number, its marks, its test
 * row and its place in the paper's count, because exam marking does not
 * understand a group of alternatives and would demand two drawings where the
 * paper asks for one.
 *
 * `id` carries the atom, not the question, so every screen that lists, numbers,
 * keys or opens a question needs no change at all. `base_id` is what the API
 * is called with. A question with no options to pick between is returned
 * untouched, with `id === base_id`, which is 4,702 of the bank's 4,704.
 */

/** Not a character that appears in a uuid or a part key, and safe in a URL. */
export const ATOM_SEP = '~';

export interface PracticeAtom extends NexusQBQuestionListItem {
  /** The question row this came from. What the API is called with. */
  base_id: string;
  /** Which option of it, or null when the question is not split. */
  part_key: string | null;
  /** 'A', 'B'... appended to the paper number, so "81A". Null when not split. */
  part_label: string | null;
}

export function atomIdOf(questionId: string, partKey?: string | null): string {
  return partKey ? `${questionId}${ATOM_SEP}${partKey}` : questionId;
}

export function splitAtomId(atomId: string | null | undefined): {
  questionId: string | null;
  partKey: string | null;
} {
  if (!atomId) return { questionId: null, partKey: null };
  const at = atomId.indexOf(ATOM_SEP);
  if (at < 0) return { questionId: atomId, partKey: null };
  return { questionId: atomId.slice(0, at), partKey: atomId.slice(at + 1) || null };
}

/** The question row id behind an atom id. */
export function baseIdOf(atomId: string | null | undefined): string | null {
  return splitAtomId(atomId).questionId;
}

/**
 * The question rows behind a set of atom ids, in order and once each.
 *
 * The boundary every list of ids crosses on its way to the API, which knows
 * only questions: a test is built of question rows, and both options of Q81
 * are one row. An atom id sent as-is is not a uuid, and the insert behind
 * "Create test" dropped the lot without a word.
 */
export function baseIdsOf(atomIds: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const atomId of atomIds) {
    const base = baseIdOf(atomId) ?? atomId;
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

/**
 * Turn a list of questions into a list of things to practise.
 *
 * Only 'any_one' splits. In 'all' mode both parts are one task with one
 * drawing, so the question stays whole.
 */
export function expandAtoms(items: NexusQBQuestionListItem[]): PracticeAtom[] {
  const out: PracticeAtom[] = [];
  for (const item of items) {
    const parts =
      item.question_format === 'DRAWING_PROMPT' ? readDrawingParts(item.drawing_parts) : null;

    if (!parts || parts.mode !== 'any_one') {
      out.push({ ...item, base_id: item.id, part_key: null, part_label: null });
      continue;
    }

    parts.items.forEach((part) => {
      const key = part.key || part.id;
      out.push({
        ...item,
        id: atomIdOf(item.id, key),
        base_id: item.id,
        part_key: key,
        part_label: part.label,
        // The option's own words, not the whole printed question. The list
        // used to show every option of Q81 as "(A) Draw a rectangular frame
        // of size 140mm x 210mm...", because question_text is the two options
        // joined by OR and the row simply truncated it.
        question_text: part.text,
        question_text_hi: part.text_hi ?? null,
        // The option's own figure. 81A has none; 81B has the graphic to rotate.
        question_image_url: part.image_url ?? null,
      });
    });
  }
  return out;
}
