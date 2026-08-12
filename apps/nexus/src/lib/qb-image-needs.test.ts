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
} from './qb-image-needs';

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

  it('does not demand one of a drawing prompt, even in a maths section', () => {
    expect(
      questionNeedsSolutionImage(mcq({ section: 'math_mcq', question_format: 'DRAWING_PROMPT' })),
    ).toBe(false);
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
