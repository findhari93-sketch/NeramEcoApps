import { describe, it, expect } from 'vitest';
import type { NexusQBQuestionListItem } from '@neram/database';
import { atomIdOf, baseIdOf, expandAtoms, splitAtomId } from './practice-atoms';

/**
 * "Attempt any one of two" becomes two things to practise.
 *
 * JEE 2014 Q81 is "draw a rectangular frame of cubes and cones" OR "rotate the
 * graphic below". Two unrelated tasks sharing a number because the exam lets
 * you pick one. Practice is not the exam: a student wants to draw both, and
 * each needs its own figure and its own upload.
 */

const question = (over: Partial<NexusQBQuestionListItem> = {}) =>
  ({
    id: 'q-81',
    question_text: 'anything',
    question_image_url: null,
    question_format: 'MCQ',
    drawing_parts: null,
    ...over,
  }) as unknown as NexusQBQuestionListItem;

const anyOneOfTwo = {
  mode: 'any_one' as const,
  items: [
    { id: 'a', key: 'a', label: 'A', text: 'Draw a rectangular frame of cubes and cones.' },
    {
      id: 'b',
      key: 'b',
      label: 'B',
      text: 'Rotate the graphic below by 90 degrees.',
      image_url: 'https://cdn/rotate.png',
    },
  ],
};

describe('atom ids', () => {
  it('is just the question when there is nothing to pick between', () => {
    expect(atomIdOf('q-81')).toBe('q-81');
    expect(atomIdOf('q-81', null)).toBe('q-81');
    expect(splitAtomId('q-81')).toEqual({ questionId: 'q-81', partKey: null });
  });

  it('carries the option alongside the question', () => {
    const id = atomIdOf('q-81', 'b');
    expect(splitAtomId(id)).toEqual({ questionId: 'q-81', partKey: 'b' });
    expect(baseIdOf(id)).toBe('q-81');
  });

  it('survives nothing at all', () => {
    expect(splitAtomId(null)).toEqual({ questionId: null, partKey: null });
    expect(baseIdOf(undefined)).toBeNull();
  });
});

describe('expanding a paper into things to practise', () => {
  it('leaves an ordinary question exactly as it was', () => {
    const [atom] = expandAtoms([question()]);
    expect(atom.id).toBe('q-81');
    expect(atom.base_id).toBe('q-81');
    expect(atom.part_key).toBeNull();
    expect(atom.part_label).toBeNull();
  });

  it('splits an either-or drawing into one per option', () => {
    const atoms = expandAtoms([
      question({ question_format: 'DRAWING_PROMPT', drawing_parts: anyOneOfTwo }),
    ]);

    expect(atoms).toHaveLength(2);
    expect(atoms.map((a) => a.part_label)).toEqual(['A', 'B']);
    expect(atoms.every((a) => a.base_id === 'q-81')).toBe(true);
    expect(atoms[0].id).not.toBe(atoms[1].id);
  });

  it('gives each option its own words', () => {
    const atoms = expandAtoms([
      question({ question_format: 'DRAWING_PROMPT', drawing_parts: anyOneOfTwo }),
    ]);

    // The list used to show both options as "(A) Draw a rectangular frame..."
    // because question_text is the pair joined by OR and the row truncated it.
    expect(atoms[0].question_text).toBe('Draw a rectangular frame of cubes and cones.');
    expect(atoms[1].question_text).toBe('Rotate the graphic below by 90 degrees.');
  });

  it('gives each option its own figure, and none to the one without', () => {
    const atoms = expandAtoms([
      question({
        question_format: 'DRAWING_PROMPT',
        question_image_url: 'https://cdn/rotate.png',
        drawing_parts: anyOneOfTwo,
      }),
    ]);

    // The shared question figure belongs to B. A is "draw a frame of cubes",
    // which needs no picture and was being shown B's graphic.
    expect(atoms[0].question_image_url).toBeNull();
    expect(atoms[1].question_image_url).toBe('https://cdn/rotate.png');
  });

  it('keeps a compulsory two-part drawing whole', () => {
    const atoms = expandAtoms([
      question({
        question_format: 'DRAWING_PROMPT',
        drawing_parts: { ...anyOneOfTwo, mode: 'all' as const },
      }),
    ]);

    // 'all' means draw both, on one sheet, as one answer.
    expect(atoms).toHaveLength(1);
    expect(atoms[0].part_key).toBeNull();
  });

  it('falls back to the position when a part has no key yet', () => {
    const atoms = expandAtoms([
      question({
        question_format: 'DRAWING_PROMPT',
        drawing_parts: {
          mode: 'any_one' as const,
          items: [
            { id: 'a', label: 'A', text: 'one' },
            { id: 'b', label: 'B', text: 'two' },
          ],
        },
      }),
    ]);

    expect(atoms.map((a) => a.part_key)).toEqual(['a', 'b']);
  });

  it('ignores parts on a question that is not a drawing', () => {
    const atoms = expandAtoms([question({ drawing_parts: anyOneOfTwo })]);
    expect(atoms).toHaveLength(1);
  });

  it('keeps the order of the paper', () => {
    const atoms = expandAtoms([
      question({ id: 'q-80' }),
      question({ id: 'q-81', question_format: 'DRAWING_PROMPT', drawing_parts: anyOneOfTwo }),
      question({ id: 'q-82' }),
    ]);
    expect(atoms.map((a) => a.base_id)).toEqual(['q-80', 'q-81', 'q-81', 'q-82']);
  });
});
