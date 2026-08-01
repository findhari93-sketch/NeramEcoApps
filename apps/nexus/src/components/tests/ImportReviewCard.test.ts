import { describe, expect, it } from 'vitest';
import { ROW_ACTIONS, type RowAction } from './ImportReviewCard';

/**
 * The action vocabulary is the whole point of the review screen, and the bug it
 * fixes was one of wording rather than logic: "Add as new" was the only visible
 * option and said nothing about what it did. These tests hold the contract that
 * every action a teacher can pick describes itself.
 */
describe('ROW_ACTIONS', () => {
  const ALL: RowAction[] = ['create', 'reuse', 'merge', 'replace', 'keep_both', 'skip'];

  it('covers every action the commit route accepts', () => {
    expect(Object.keys(ROW_ACTIONS).sort()).toEqual([...ALL].sort());
  });

  it('gives every action a label and a consequence', () => {
    for (const a of ALL) {
      expect(ROW_ACTIONS[a].label.length).toBeGreaterThan(0);
      // The regression this guards: an action whose effect a teacher has to
      // guess at. Anything shorter than a sentence is not an explanation.
      expect(ROW_ACTIONS[a].effect.length).toBeGreaterThan(20);
    }
  });

  it('offers create and skip on every row, duplicate or not', () => {
    expect(ROW_ACTIONS.create.duplicateOnly).toBe(false);
    expect(ROW_ACTIONS.skip.duplicateOnly).toBe(false);
  });

  it('offers the four duplicate resolutions only when there is a duplicate', () => {
    for (const a of ['reuse', 'merge', 'replace', 'keep_both'] as RowAction[]) {
      expect(ROW_ACTIONS[a].duplicateOnly).toBe(true);
    }
  });

  it('uses no em dashes or double dashes in teacher-facing copy', () => {
    for (const a of ALL) {
      const text = `${ROW_ACTIONS[a].label} ${ROW_ACTIONS[a].effect}`;
      expect(text).not.toMatch(/—|--|&mdash;/);
    }
  });

  it('warns that replace is the destructive one', () => {
    // Replace rewrites a row other tests already point at. If that stops being
    // spelled out, a teacher can silently rewrite a question mid-term.
    expect(ROW_ACTIONS.replace.effect.toLowerCase()).toContain('already using it');
  });
});
