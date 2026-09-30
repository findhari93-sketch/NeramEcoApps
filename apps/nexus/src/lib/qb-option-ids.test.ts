import { describe, it, expect } from 'vitest';
import {
  defaultOptions,
  hasOptionText,
  nextOptionId,
  normalizeOptionIds,
  optionLetter,
  withOptionAdded,
} from './qb-option-ids';

const opts = (...ids: string[]) => ids.map((id) => ({ id, text: '' }));

describe('nextOptionId', () => {
  it('gives a fifth option the id e, never opt_4_<timestamp>', () => {
    expect(nextOptionId(opts('a', 'b', 'c', 'd'))).toBe('e');
  });

  it('reuses a deleted letter rather than colliding', () => {
    // b was deleted, so position 3 wants d, which is taken.
    expect(nextOptionId(opts('a', 'c', 'd'))).toBe('b');
  });

  it('stops at eight options', () => {
    expect(nextOptionId(opts('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'))).toBeNull();
  });
});

describe('normalizeOptionIds', () => {
  it('renames the saved opt_ id to e and carries the answer key with it', () => {
    const r = normalizeOptionIds(opts('a', 'b', 'c', 'd', 'opt_4_1790751639407'), 'opt_4_1790751639407');
    expect(r.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.correctAnswer).toBe('e');
  });

  it('leaves a normal question and its answer key untouched', () => {
    const options = opts('a', 'b', 'c', 'd');
    const r = normalizeOptionIds(options, 'b');
    expect(r.options).toBe(options);
    expect(r.correctAnswer).toBe('b');
  });

  it('renames an all-opt_ question from the old wizard to a to d', () => {
    const r = normalizeOptionIds(opts('opt_0_1', 'opt_1_1', 'opt_2_1', 'opt_3_1'), 'opt_2_1');
    expect(r.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.correctAnswer).toBe('c');
  });

  it('treats a missing answer key as blank', () => {
    expect(normalizeOptionIds([], null).correctAnswer).toBe('');
  });
});

describe('withOptionAdded', () => {
  const nota = { text: 'None of the above', text_hi: 'इनमें से कोई नहीं' };

  it('fills a blank last option instead of adding an empty E and a filled F', () => {
    const next = withOptionAdded([...opts('a', 'b', 'c', 'd').map((o) => ({ ...o, text: o.id })), { id: 'e', text: '' }], nota);
    expect(next?.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(next?.[4]).toEqual({ id: 'e', ...nota });
  });

  it('adds a new option when the last one has text', () => {
    const next = withOptionAdded(opts('a', 'b').map((o) => ({ ...o, text: 'x' })), nota);
    expect(next?.[2]).toEqual({ id: 'c', ...nota });
  });

  it('keeps a last option that has only a picture', () => {
    const next = withOptionAdded(opts('a', 'b'), nota, (id) => id === 'b');
    expect(next?.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('adds a blank on plain Add option even when the last is blank', () => {
    expect(withOptionAdded(opts('a'))?.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('returns null with eight filled options', () => {
    const full = opts('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h').map((o) => ({ ...o, text: 'x' }));
    expect(withOptionAdded(full, nota)).toBeNull();
  });
});

describe('helpers', () => {
  it('letters by position', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(4)).toBe('E');
  });

  it('starts a new question with a to d', () => {
    expect(defaultOptions().map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('matches quick option text ignoring case and spaces', () => {
    expect(hasOptionText([{ text: '  none of the ABOVE ' }], 'None of the above')).toBe(true);
    expect(hasOptionText([{ text: '$\\frac{9}{4}$' }], 'None of the above')).toBe(false);
  });
});
