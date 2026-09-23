import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { getQBHelpUsed, getQBPracticeOrigins } from './qb-practice-origin';

/**
 * "Practised: JEE 2014 Q81B".
 *
 * A sketchbook month is a grid of squares. Without this label there is no way
 * to tell the one that answers a past paper question from Tuesday's ten minute
 * sketch, and no way to get back to the question to draw it again.
 */

const anyOneOfTwo = {
  mode: 'any_one',
  items: [
    { id: 'a', key: 'a', label: 'A', text: 'Draw a frame of cubes and cones.' },
    { id: 'b', key: 'b', label: 'B', text: 'Rotate the graphic below.' },
  ],
};

function seed(over: Record<string, any[]> = {}) {
  return createFakeDb({
    drawing_questions: [
      { id: 'mirror-a', qb_question_id: 'qb-81', qb_part_id: 'a' },
      { id: 'mirror-b', qb_question_id: 'qb-81', qb_part_id: 'b' },
      { id: 'mirror-plain', qb_question_id: 'qb-7', qb_part_id: '' },
      // An assignment's hidden question: no bank question behind it.
      { id: 'mirror-none', qb_question_id: null, qb_part_id: '' },
    ],
    nexus_qb_questions: [
      { id: 'qb-81', drawing_parts: anyOneOfTwo },
      { id: 'qb-7', drawing_parts: null },
    ],
    nexus_qb_question_sources: [
      { question_id: 'qb-81', exam_type: 'JEE_MAIN_PAPER_2', year: 2014, question_number: 81 },
      { question_id: 'qb-7', exam_type: 'NATA', year: 2019, question_number: 7 },
    ],
    drawing_submissions: [],
    ...over,
  });
}

describe('getQBPracticeOrigins', () => {
  it('names the paper, the number and the option', async () => {
    const db = seed();
    const out = await getQBPracticeOrigins(['mirror-b'], db.client);

    expect(out['mirror-b'].label).toBe('JEE 2014 Q81B');
    expect(out['mirror-b'].part_label).toBe('B');
    expect(out['mirror-b'].qb_question_id).toBe('qb-81');
  });

  it('leaves the letter off a question that is not split', async () => {
    const db = seed();
    const out = await getQBPracticeOrigins(['mirror-plain'], db.client);

    expect(out['mirror-plain'].label).toBe('NATA 2019 Q7');
    expect(out['mirror-plain'].part_label).toBeNull();
  });

  it('tells the two options of one question apart', async () => {
    const db = seed();
    const out = await getQBPracticeOrigins(['mirror-a', 'mirror-b'], db.client);

    // 81A and 81B are two unrelated tasks. A sketchbook that called both of
    // them "Q81" would be no better than no label at all.
    expect(out['mirror-a'].label).toBe('JEE 2014 Q81A');
    expect(out['mirror-b'].label).toBe('JEE 2014 Q81B');
  });

  it('skips a drawing question that is not from the bank', async () => {
    const db = seed();
    const out = await getQBPracticeOrigins(['mirror-none'], db.client);

    expect(out['mirror-none']).toBeUndefined();
  });

  it('still says something when the paper is unknown', async () => {
    const db = seed({ nexus_qb_question_sources: [] });
    const out = await getQBPracticeOrigins(['mirror-plain'], db.client);

    expect(out['mirror-plain'].label).toBe('Question bank');
  });

  it('asks the database nothing when there is nothing to ask about', async () => {
    const db = seed();
    expect(await getQBPracticeOrigins([], db.client)).toEqual({});
    expect(await getQBPracticeOrigins(['', ''], db.client)).toEqual({});
  });
});

describe('getQBHelpUsed', () => {
  it('reads what was stamped on the attempt', async () => {
    const db = seed({
      drawing_submissions: [
        { id: 's1', qb_help_used: ['solution'] },
        { id: 's2', qb_help_used: [] },
        { id: 's3', qb_help_used: null },
      ],
    });
    const out = await getQBHelpUsed(['s1', 's2', 's3'], db.client);

    expect(out.s1).toEqual(['solution']);
    // An honest attempt and a row from before the column existed both say
    // nothing here, and the screen shows "Drawn without help" for a bank
    // drawing either way.
    expect(out.s2).toBeUndefined();
    expect(out.s3).toBeUndefined();
  });
});
