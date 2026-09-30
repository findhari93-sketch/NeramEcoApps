import type { NexusQBQuestionOption } from '@neram/database';

/**
 * Ids an MCQ option may take. Imported papers store options as a, b, c, d and
 * students see them by position as A to H (MCQOptions), so eight is the ceiling.
 *
 * The editors used to mint `opt_4_1790751639407` for an added option, which
 * then showed as "Option OPT_4_1790751639407" in the editor and as the answer
 * key in the paper list. A fifth option is simply `e`.
 */
export const QB_OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const QB_MAX_OPTIONS = QB_OPTION_IDS.length;

const VALID_IDS = new Set<string>(QB_OPTION_IDS);

/** 0 is A, 4 is E. The letter a student sees for the option at that position. */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * The id for the next option. The letter for the new position when it is free
 * (a, b, c, d then e), otherwise the first unused letter, so a deleted option's
 * letter is reused rather than colliding. Null once all eight are taken.
 */
export function nextOptionId(options: Pick<NexusQBQuestionOption, 'id'>[]): string | null {
  const used = new Set(options.map((o) => o.id));
  const positional = QB_OPTION_IDS[options.length];
  if (positional && !used.has(positional)) return positional;
  return QB_OPTION_IDS.find((id) => !used.has(id)) ?? null;
}

/** Four blank options, a to d, for a question that has none yet. */
export function defaultOptions(): NexusQBQuestionOption[] {
  return QB_OPTION_IDS.slice(0, 4).map((id) => ({ id, text: '' }));
}

/** The one-tap options offered under the list, with their Hindi. */
export const QB_QUICK_OPTIONS = [
  { text: 'None of the above', text_hi: 'इनमें से कोई नहीं' },
  { text: 'All of the above', text_hi: 'उपर्युक्त सभी' },
] as const;

type QuickOption = { text: string; text_hi?: string };
type OptionLike = Pick<NexusQBQuestionOption, 'id' | 'text'> & Partial<Pick<NexusQBQuestionOption, 'text_hi' | 'image_url'>>;

/** Nothing typed and no picture, in either language. */
function isBlankOption(o: OptionLike, hasImage: boolean): boolean {
  return !(o.text ?? '').trim() && !(o.text_hi ?? '').trim() && !o.image_url && !hasImage;
}

/**
 * Where a quick option ("None of the above") lands: into the last option when
 * it is still blank, so tapping "Add option E" and then the quick button gives
 * one E rather than an empty E and a filled F. Otherwise a new option on the
 * end. Null when there is no room.
 */
export function quickOptionIndex(
  options: OptionLike[],
  hasImage: (id: string) => boolean = () => false,
): number | null {
  const last = options[options.length - 1];
  if (last && isBlankOption(last, hasImage(last.id))) return options.length - 1;
  return options.length < QB_MAX_OPTIONS ? options.length : null;
}

/**
 * The options after "Add option" (no quick option: a blank on the end) or a
 * quick option (fills a blank last option, else goes on the end). Null when
 * nothing can be added.
 */
export function withOptionAdded(
  options: NexusQBQuestionOption[],
  quick?: QuickOption,
  hasImage?: (id: string) => boolean,
): NexusQBQuestionOption[] | null {
  if (quick) {
    const idx = quickOptionIndex(options, hasImage);
    if (idx === null) return null;
    if (idx < options.length) {
      return options.map((o, i) => (i === idx ? { ...o, text: quick.text, text_hi: quick.text_hi } : o));
    }
  }
  const id = nextOptionId(options);
  if (!id) return null;
  return [...options, { id, text: quick?.text ?? '', ...(quick?.text_hi ? { text_hi: quick.text_hi } : {}) }];
}

/** Whether an option already says this, ignoring case and spacing. */
export function hasOptionText(options: Pick<NexusQBQuestionOption, 'text'>[], text: string): boolean {
  const want = text.trim().toLowerCase();
  return options.some((o) => (o.text ?? '').trim().toLowerCase() === want);
}

/**
 * Renames any id that is not a single letter (the old `opt_4_<timestamp>`
 * ids) to the next free letter, carrying the answer key with it. Letter ids
 * are never touched, so a saved answer key on a normal question is unchanged.
 */
export function normalizeOptionIds(
  options: NexusQBQuestionOption[],
  correctAnswer: string | null | undefined,
): { options: NexusQBQuestionOption[]; correctAnswer: string } {
  const answer = correctAnswer ?? '';
  if (options.every((o) => VALID_IDS.has(o.id))) return { options, correctAnswer: answer };

  const used = new Set(options.filter((o) => VALID_IDS.has(o.id)).map((o) => o.id));
  let nextAnswer = answer;
  const next = options.map((o) => {
    if (VALID_IDS.has(o.id)) return o;
    const id = QB_OPTION_IDS.find((l) => !used.has(l));
    if (!id) return o; // More than eight options: leave the rest as they are.
    used.add(id);
    if (answer === o.id) nextAnswer = id;
    return { ...o, id };
  });
  return { options: next, correctAnswer: nextAnswer };
}
