import { describe, it, expect } from 'vitest';
import type { NexusQBQuestion } from '@neram/database';
import {
  questionReferencesFigure,
  questionNeedsImage,
  questionImageSlots,
  questionMissingImages,
  questionImagesComplete,
  questionImagesPartial,
  questionNeedsSolutionImage,
  questionMissingSolutionImage,
  partIdOfSolutionSlot,
  partSolutionUrl,
  slotFilledOnServer,
  solutionGapMessage,
  solutionSlotProgress,
} from './qb-image-needs';

/**
 * A drawing question, optionally split into parts. 2014 Q82 is the real one:
 * "Draw from memory a balloon seller ... OR ... " with two options, either of
 * which a student may answer, so each owes its own worked solution.
 */
function drawing(over: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: 'd1',
    question_text: 'Draw from memory a balloon seller.',
    question_format: 'DRAWING_PROMPT',
    question_image_url: null,
    options: null,
    needs_image: false,
    section: 'drawing',
    ...over,
  } as unknown as NexusQBQuestion;
}

function parts(
  items: { solution_image_url?: string | null }[],
  mode: 'all' | 'any_one' = 'any_one',
) {
  return {
    mode,
    stem: null,
    stem_hi: null,
    items: items.map((item, i) => ({
      id: 'abcd'[i],
      label: 'ABCD'[i],
      text: `Option ${'ABCD'[i]}`,
      text_hi: null,
      marks: null,
      solution_image_url: item.solution_image_url ?? null,
      solution_video_url: null,
    })),
  };
}

/**
 * Every case below is a real question from a real paper, not an invented one.
 * The old rules got each of them wrong in a different way:
 *  - Q27 ("...options given below") flagged as missing a figure it never had.
 *  - the header count never fell as figures were uploaded, because it counted
 *    mentions, not gaps.
 *  - Q41's four unlabelled answer figures were treated the same as Q2's four
 *    plain numbers, so Q2 stayed amber forever.
 */

function mcq(over: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: 'q1',
    question_text: '',
    question_format: 'MCQ',
    question_image_url: null,
    options: [
      { id: 'a', text: '16' },
      { id: 'b', text: '14' },
      { id: 'c', text: '13' },
      { id: 'd', text: '12' },
    ],
    needs_image: null,
    ...over,
  } as unknown as NexusQBQuestion;
}

describe('questionReferencesFigure', () => {
  it('does not flag a question whose only match is "options given below"', () => {
    const q = mcq({
      question_text:
        'Warm colours appear closer and cool ones further away. What are generally considered warm and cool colours? Select one group from the options given below:',
    });
    expect(questionReferencesFigure(q)).toBe(false);
  });

  it('flags a question that actually names a figure', () => {
    const q = mcq({ question_text: 'How many total number of rectangles are there in the figure given below?' });
    expect(questionReferencesFigure(q)).toBe(true);
  });

  it('flags IMAGE_BASED regardless of wording', () => {
    const q = mcq({ question_format: 'IMAGE_BASED', question_text: 'See above.' });
    expect(questionReferencesFigure(q)).toBe(true);
  });
});

describe('questionImageSlots', () => {
  it('expects only the question slot when the figure is in the stem and the options are plain numbers', () => {
    const q = mcq({ question_text: 'How many total number of rectangles are there in the figure given below?' });
    const slots = questionImageSlots(q);
    const question = slots.find((s) => s.slot === 'question')!;
    const options = slots.filter((s) => s.slot !== 'question');
    expect(question.expected).toBe(true);
    expect(options.every((s) => !s.expected)).toBe(true);
  });

  it('expects every option slot when all four are unlabelled answer figures', () => {
    const q = mcq({
      question_text: 'Which one of the answer figures shows the correct view of the 3-D problem figure?',
      options: [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' },
      ],
    });
    const slots = questionImageSlots(q);
    expect(slots.every((s) => s.expected)).toBe(true);
    expect(slots).toHaveLength(5);
  });

  it("a teacher's true beats a wordless question", () => {
    const q = mcq({ question_text: 'Plain text, no figure words.', needs_image: true });
    expect(questionImageSlots(q)[0].expected).toBe(true);
  });

  it("a teacher's false beats a matching keyword", () => {
    const q = mcq({ question_text: 'There is a figure here.', needs_image: false });
    expect(questionImageSlots(q).every((s) => !s.expected)).toBe(true);
  });

  it('reads unsaved work through the isFilled override, not the saved row', () => {
    const q = mcq({ question_text: 'The figure below.', question_image_url: null });
    const slots = questionImageSlots(q, (slot) => slot === 'question');
    expect(slots.find((s) => s.slot === 'question')!.filled).toBe(true);
  });
});

describe('questionMissingImages', () => {
  it('is false for a text MCQ that only mentions "options given below"', () => {
    const q = mcq({
      question_text: 'Select one group from the options given below:',
    });
    expect(questionMissingImages(q)).toBe(false);
  });

  it('is true while the one expected question image is absent', () => {
    const q = mcq({ question_text: 'The figure given below shows a square.', question_image_url: null });
    expect(questionMissingImages(q)).toBe(true);
  });

  it('is false once the expected image is uploaded, even though the wording still mentions a figure', () => {
    const q = mcq({
      question_text: 'The figure given below shows a square.',
      question_image_url: 'https://x/img.png',
    });
    expect(questionMissingImages(q)).toBe(false);
  });
});

describe('questionImagesComplete / questionImagesPartial', () => {
  it('a question with no expected slots is neither complete nor partial', () => {
    const q = mcq({ question_text: 'Plain text question.' });
    expect(questionImagesComplete(q)).toBe(false);
    expect(questionImagesPartial(q)).toBe(false);
  });

  it('partial when the question image landed but the option figures did not', () => {
    const q = mcq({
      question_text: 'Which answer figure completes the series?',
      question_image_url: 'https://x/q.png',
      options: [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' },
      ],
    });
    expect(questionImagesPartial(q)).toBe(true);
    expect(questionImagesComplete(q)).toBe(false);
  });
});

describe('the solution-image rule', () => {
  it('demands one of a maths MCQ', () => {
    expect(questionNeedsSolutionImage(mcq({ section: 'math_mcq' }))).toBe(true);
  });

  it('demands one of a maths numerical', () => {
    expect(
      questionNeedsSolutionImage(mcq({ section: 'math_numerical', question_format: 'NUMERICAL' })),
    ).toBe(true);
  });

  it('does not demand one of an aptitude question', () => {
    expect(questionNeedsSolutionImage(mcq({ section: 'aptitude' }))).toBe(false);
  });

  it('demands one of a drawing prompt, whatever section it sits in', () => {
    // A drawing is the one format where the worked answer is the teaching. It
    // used to be excluded here, so JEE Paper 2 2014 read "Solution missing 0"
    // with neither of its two drawings answered.
    expect(questionNeedsSolutionImage(drawing({ section: 'drawing' }))).toBe(true);
    expect(questionNeedsSolutionImage(drawing({ section: 'math_mcq' }))).toBe(true);
  });

  it('demands one of a drawing whose section was never filled in', () => {
    // The "do not nag an unsectioned question" rule below is about a guess that
    // may not have been run. A drawing is judged on its format, which is never
    // guessed, so an unsectioned paper does not hide its drawings.
    expect(questionNeedsSolutionImage(drawing({ section: null }))).toBe(true);
  });

  it('does not nag a question with no section yet: the unsectioned warning owns that', () => {
    expect(questionNeedsSolutionImage(mcq({ section: null }))).toBe(false);
  });

  it('is missing while the maths question has no solution image', () => {
    expect(questionMissingSolutionImage(mcq({ section: 'math_mcq' }))).toBe(true);
  });

  it('is satisfied once the image is there', () => {
    const q = mcq({ section: 'math_mcq', solution_image_url: 'https://x/sol.png' });
    expect(questionMissingSolutionImage(q)).toBe(false);
  });

  it('a written explanation does not excuse it', () => {
    const q = mcq({
      section: 'math_mcq',
      explanation_detailed: 'Substitute x = 2 and expand, then compare coefficients.',
    });
    expect(questionMissingSolutionImage(q)).toBe(true);
  });

  it("a teacher's 'no figure needed' does not clear the solution debt", () => {
    // needs_image is the verdict on the *figure*, and "this maths question
    // needs no diagram" is a common and correct thing to say about a question
    // that still owes its working.
    const q = mcq({ section: 'math_mcq', needs_image: false });
    expect(questionMissingSolutionImage(q)).toBe(true);
    expect(questionMissingImages(q)).toBe(false);
  });

  it('reads unsaved work through the isFilled override, like every other slot', () => {
    const q = mcq({ section: 'math_mcq' });
    expect(questionMissingSolutionImage(q, (slot) => slot === 'solution')).toBe(false);
  });
});

describe('the two backlogs stay separate', () => {
  it('appends a solution slot for maths and none for aptitude', () => {
    const maths = questionImageSlots(mcq({ section: 'math_mcq' }));
    expect(maths.filter((s) => s.kind === 'solution')).toHaveLength(1);
    expect(questionImageSlots(mcq({ section: 'aptitude' })).some((s) => s.kind === 'solution')).toBe(
      false,
    );
  });

  it('keeps a stray solution image reachable even where none is demanded', () => {
    // Somebody attached working to an aptitude question. The slot has to exist
    // so the image is visible and removable, but it is not expected.
    const slot = questionImageSlots(
      mcq({ section: 'aptitude', solution_image_url: 'https://x/sol.png' }),
    ).find((s) => s.kind === 'solution');
    expect(slot).toBeDefined();
    expect(slot!.expected).toBe(false);
    expect(slot!.filled).toBe(true);
  });

  it('a missing solution does not make the figure backlog claim the question', () => {
    // The whole point of `kind`: forty maths questions owing solutions must not
    // turn the "N missing an image" count into forty overnight.
    const q = mcq({ section: 'math_mcq', question_text: 'Plain text question.' });
    expect(questionMissingSolutionImage(q)).toBe(true);
    expect(questionMissingImages(q)).toBe(false);
    expect(questionImagesComplete(q)).toBe(false);
    expect(questionImagesPartial(q)).toBe(false);
  });
});

describe('a drawing owes one solution image per part', () => {
  it('emits a slot per part, every one expected', () => {
    const slots = questionImageSlots(drawing({ drawing_parts: parts([{}, {}]) })).filter(
      (s) => s.kind === 'solution',
    );
    expect(slots.map((s) => s.slot)).toEqual(['solution-a', 'solution-b']);
    expect(slots.map((s) => s.label)).toEqual(['Solution A', 'Solution B']);
    expect(slots.every((s) => s.expected)).toBe(true);
  });

  it('never offers the mirrored question column as a slot of its own', () => {
    // solution_image_url only mirrors the first part that has one. A dropzone
    // writing it would be overwritten by the next parts save, so a parts
    // question must not have a bare 'solution' slot even when it is set.
    const slots = questionImageSlots(
      drawing({
        drawing_parts: parts([{ solution_image_url: 'https://x/a.png' }, {}]),
        solution_image_url: 'https://x/a.png',
      }),
    );
    expect(slots.some((s) => s.slot === 'solution')).toBe(false);
  });

  it('is still missing when only one option of an "attempt any one" is answered', () => {
    // The student may answer either option, so one worked answer covers half
    // the question. This used to read as solved everywhere.
    const half = drawing({
      drawing_parts: parts([{ solution_image_url: 'https://x/a.png' }, {}]),
      solution_image_url: 'https://x/a.png',
    });
    expect(questionMissingSolutionImage(half)).toBe(true);
  });

  it('is satisfied once every part has its own', () => {
    const done = drawing({
      drawing_parts: parts([
        { solution_image_url: 'https://x/a.png' },
        { solution_image_url: 'https://x/b.png' },
      ]),
      solution_image_url: 'https://x/a.png',
    });
    expect(questionMissingSolutionImage(done)).toBe(false);
  });

  it('demands all three of an "answer all parts" question', () => {
    const q = drawing({
      drawing_parts: parts(
        [{ solution_image_url: 'https://x/a.png' }, { solution_image_url: 'https://x/b.png' }, {}],
        'all',
      ),
    });
    expect(solutionSlotProgress(q)).toEqual({ done: 2, total: 3 });
    expect(questionMissingSolutionImage(q)).toBe(true);
  });

  it('falls back to the question column when the parts are malformed', () => {
    // One item fails the 2-to-4 rule, so readDrawingParts returns null and the
    // question is treated as the single task it effectively is.
    const q = drawing({ drawing_parts: parts([{}]) });
    const slots = questionImageSlots(q).filter((s) => s.kind === 'solution');
    expect(slots).toHaveLength(1);
    expect(slots[0].slot).toBe('solution');
    expect(slots[0].expected).toBe(true);
  });

  it('a drawing that was never split owes the question-level image', () => {
    expect(questionMissingSolutionImage(drawing())).toBe(true);
    expect(questionMissingSolutionImage(drawing({ solution_image_url: 'https://x/s.png' }))).toBe(
      false,
    );
  });
});

describe('reading a part slot', () => {
  it('maps a part slot to its id and leaves every other slot alone', () => {
    expect(partIdOfSolutionSlot('solution-b')).toBe('b');
    expect(partIdOfSolutionSlot('solution')).toBeNull();
    expect(partIdOfSolutionSlot('question')).toBeNull();
    expect(partIdOfSolutionSlot('b')).toBeNull();
  });

  it('reads a part image out of the JSONB', () => {
    const q = drawing({ drawing_parts: parts([{}, { solution_image_url: 'https://x/b.png' }]) });
    expect(partSolutionUrl(q, 'b')).toBe('https://x/b.png');
    expect(partSolutionUrl(q, 'a')).toBeNull();
    expect(slotFilledOnServer(q, 'solution-b')).toBe(true);
    expect(slotFilledOnServer(q, 'solution-a')).toBe(false);
  });

  it('answers for the slots it always did', () => {
    const q = mcq({
      question_image_url: 'https://x/q.png',
      solution_image_url: 'https://x/s.png',
      options: [{ id: 'a', text: '16', image_url: 'https://x/a.png' }, { id: 'b', text: '14' }],
    });
    expect(slotFilledOnServer(q, 'question')).toBe(true);
    expect(slotFilledOnServer(q, 'solution')).toBe(true);
    expect(slotFilledOnServer(q, 'a')).toBe(true);
    expect(slotFilledOnServer(q, 'b')).toBe(false);
  });
});

describe('the sentence a teacher reads', () => {
  it('names the format when a single image is owed', () => {
    expect(solutionGapMessage(mcq({ section: 'math_mcq' }))).toBe(
      'No solution image yet. Maths questions need one.',
    );
    expect(solutionGapMessage(drawing())).toBe(
      'No solution image yet. Drawing questions need one.',
    );
  });

  it('counts the parts once the question is split', () => {
    expect(solutionGapMessage(drawing({ drawing_parts: parts([{}, {}]) }))).toBe(
      'No solution images yet. Each of the 2 parts needs its own.',
    );
    expect(
      solutionGapMessage(
        drawing({ drawing_parts: parts([{ solution_image_url: 'https://x/a.png' }, {}]) }),
      ),
    ).toBe('Solution images: 1 of 2 parts. Each part needs its own.');
  });

  it('says nothing when there is nothing to say', () => {
    expect(solutionGapMessage(mcq({ section: 'aptitude' }))).toBeNull();
    expect(solutionGapMessage(drawing({ solution_image_url: 'https://x/s.png' }))).toBeNull();
  });
});

describe('nothing changed for the formats that were already right', () => {
  it('leaves a maths MCQ and an aptitude MCQ with the slots they always had', () => {
    // The guard against widening SlotType quietly widening the figure backlog.
    expect(questionImageSlots(mcq({ section: 'math_mcq' })).map((s) => s.slot)).toEqual([
      'question',
      'a',
      'b',
      'c',
      'd',
      'solution',
    ]);
    expect(questionImageSlots(mcq({ section: 'aptitude' })).map((s) => s.slot)).toEqual([
      'question',
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});
