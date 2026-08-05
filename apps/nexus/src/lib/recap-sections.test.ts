import { describe, it, expect } from 'vitest';
import { toEditableSections, formatClock, emptySection, emptyQuestion } from './recap-sections';

/**
 * The regression guard for a silent data loss.
 *
 * updateRecapSections decides update-in-place versus re-create on the presence
 * of section.id, and re-creating archives the live rows. nexus_class_recap_
 * attempts hangs off those rows, so every student who had passed a checkpoint
 * ends up pointing at an invisible one and is re-locked mid-recap.
 *
 * The class-recap editor's own loader dropped the id, which reintroduced that
 * bug one layer above the query test written to prevent it. Every screen now
 * loads through toEditableSections, and this asserts the one property that
 * matters about it.
 */

describe('toEditableSections: the id survives', () => {
  it('carries the section id through, because a save without it destroys attempts', () => {
    const out = toEditableSections([
      { id: 'sec-a', title: 'Intro', start_timestamp_seconds: 0, end_timestamp_seconds: 300, questions: [] },
    ]);
    expect(out[0].id).toBe('sec-a');
  });

  it('omits the id for a freshly generated checkpoint, so it inserts rather than updates', () => {
    const out = toEditableSections([
      { title: 'Generated', start_timestamp_seconds: 0, end_timestamp_seconds: 300, questions: [] },
    ]);
    expect('id' in out[0]).toBe(false);
  });

  it('survives a full load, edit, save round trip with the id intact', () => {
    const loaded = toEditableSections([
      { id: 'sec-a', title: 'Intro', start_timestamp_seconds: 0, end_timestamp_seconds: 300, questions: [] },
    ]);
    const edited = loaded.map((s) => ({ ...s, title: 'Intro, retitled' }));
    expect(edited[0].id).toBe('sec-a');
    expect(edited[0].title).toBe('Intro, retitled');
  });

  it('fills in every question field, so no input is handed an undefined value', () => {
    const out = toEditableSections([
      { id: 's', title: '', start_timestamp_seconds: 0, end_timestamp_seconds: 1, questions: [{ id: 'q1' }] },
    ]);
    const q = out[0].questions[0];
    expect(q.question_text).toBe('');
    expect(q.option_a).toBe('');
    expect(q.option_d).toBe('');
    expect(q.correct_option).toBe('a');
    expect(q.explanation).toBe('');
  });

  it('defaults a missing correct_option to a rather than leaving it blank', () => {
    const out = toEditableSections([
      { id: 's', title: '', start_timestamp_seconds: 0, end_timestamp_seconds: 1, questions: [{ correct_option: null }] },
    ]);
    expect(out[0].questions[0].correct_option).toBe('a');
  });

  it('handles an empty or absent list', () => {
    expect(toEditableSections([])).toEqual([]);
    expect(toEditableSections(undefined as never)).toEqual([]);
  });
});

describe('formatClock', () => {
  it('reads as a position in the recording', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(372)).toBe('6:12');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('never renders NaN into the label', () => {
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('the blank rows', () => {
  it('numbers a new checkpoint from its position', () => {
    expect(emptySection(2).title).toBe('Checkpoint 3');
  });

  it('gives a new checkpoint one question, so the card is never empty', () => {
    expect(emptySection(0).questions).toHaveLength(1);
  });

  it('leaves min_questions_to_pass null, which the server then stamps', () => {
    // Never a hardcoded number here. A NULL pass mark once meant "get every one
    // of the whole bank right", and the PUT route resolves both columns from the
    // same source the student quiz grades against.
    expect(emptySection(0).min_questions_to_pass).toBeNull();
  });

  it('starts a new question on option a with nothing filled in', () => {
    expect(emptyQuestion()).toEqual({
      question_text: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_option: 'a',
      explanation: '',
    });
  });
});
