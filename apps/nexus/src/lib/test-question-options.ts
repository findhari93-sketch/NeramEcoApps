/**
 * Reading a question's options the way a teacher reads them.
 *
 * Lifted out of the test detail page, where "is this the right option" lived
 * inline, because the Questions tab rows and the "What changed" history both
 * need the same answer, and two copies of a correctness check disagree sooner
 * or later.
 */

export interface QuestionOptionLike {
  id?: string;
  label?: string;
  text?: string;
  image_url?: string | null;
}

/** An option is correct when correct_answer matches its id, its label, or its position letter. */
export function isCorrectOption(
  opt: QuestionOptionLike,
  index: number,
  correct: string | null | undefined,
): boolean {
  if (!correct) return false;
  const c = String(correct).trim().toLowerCase();
  if (opt.id && String(opt.id).trim().toLowerCase() === c) return true;
  if (opt.label && String(opt.label).trim().toLowerCase() === c) return true;
  return c === String.fromCharCode(97 + index);
}

/** The letter printed beside an option: its own label, else A, B, C by position. */
export function optionLetter(opt: QuestionOptionLike, index: number): string {
  const own = opt.label ? String(opt.label).trim() : '';
  return own || String.fromCharCode(65 + index);
}

/**
 * One stored field value as readable text, for "What changed".
 *
 * An answer key is shown as the option it names, because "b" means nothing to
 * a teacher scanning a history. Options read as one line.
 */
export function describeFieldValue(
  field: string,
  value: unknown,
  options: QuestionOptionLike[] | null | undefined,
): string | null {
  if (value == null || value === '') return null;

  if (field === 'correct_answer') {
    const list = options || [];
    const index = list.findIndex((o, i) => isCorrectOption(o, i, String(value)));
    if (index >= 0) {
      const text = (list[index].text || '').trim();
      return text ? `${optionLetter(list[index], index)}. ${text}` : optionLetter(list[index], index);
    }
    return String(value);
  }

  if (field === 'options' && Array.isArray(value)) {
    return (value as QuestionOptionLike[])
      .map((o, i) => `${optionLetter(o, i)}. ${(o.text || '').trim()}`.trim())
      .join('   ');
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}
