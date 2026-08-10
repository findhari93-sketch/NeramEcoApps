import { describe, it, expect } from 'vitest';
import { validateAndConvertJSON, AI_PROMPT_TEMPLATE, HINDI_AI_PROMPT_TEMPLATE } from './bulk-upload-schema';

/**
 * Where the 22 invented drawing questions came from.
 *
 * Nothing in the codebase generates text like "Drawing question 1 (on separate
 * Drawing Sheet). Total marks: 70." It is model output that got stored. The
 * extraction prompt told the model to produce a `drawing` section; the JEE
 * Paper 2 drawing sheet is printed separately and is usually missing from a
 * scanned PDF; with nothing to read, the model wrote a stand-in and the
 * importer took it at face value.
 *
 * Two things have to hold for that not to recur, and both are pinned here:
 * the prompt must forbid the invention outright, and a paper that legitimately
 * omits its drawing section must still import cleanly rather than tripping the
 * count check as an error.
 */

function paperWithout(drawingSection: boolean) {
  return {
    schema_version: '1.0',
    paper: { exam_name: 'JEE Paper 2 2012', total_questions: 82 },
    sections: [
      {
        name: 'Mathematics (MCQ)',
        section_key: 'math_mcq',
        question_count: 2,
        questions: [
          {
            question_number: 1,
            question_text: 'A question',
            question_format: 'MCQ',
            options: [
              { label: 'A', text: 'one' },
              { label: 'B', text: 'two' },
            ],
            correct_answer: 'A',
          },
          {
            question_number: 2,
            question_text: 'Another question',
            question_format: 'MCQ',
            options: [
              { label: 'A', text: 'one' },
              { label: 'B', text: 'two' },
            ],
            correct_answer: 'B',
          },
        ],
      },
      ...(drawingSection
        ? [
            {
              name: 'Drawing Test',
              section_key: 'drawing',
              question_count: 1,
              questions: [
                {
                  question_number: 81,
                  question_text: 'Draw a scene of a village railway station at dusk.',
                  question_format: 'DRAWING_PROMPT',
                },
              ],
            },
          ]
        : []),
    ],
  };
}

describe('a paper whose drawing sheet was not in the PDF', () => {
  it('imports cleanly with the drawing section omitted', () => {
    const result = validateAndConvertJSON(paperWithout(false));

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.questions).toHaveLength(2);
  });

  it('warns about the short count without calling it an error', () => {
    // The count check has to stay a warning. Made an error, it would block
    // every honest import of a paper whose drawing sheet is separate, which is
    // most of the JEE Paper 2 back catalogue.
    const result = validateAndConvertJSON(paperWithout(false));

    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toContain('82');
  });

  it('still imports a real drawing prompt when the sheet IS present', () => {
    const result = validateAndConvertJSON(paperWithout(true));

    expect(result.valid).toBe(true);
    expect(result.questions).toHaveLength(3);
    expect(result.questions[2].question_format).toBe('DRAWING_PROMPT');
  });
});

describe('the extraction prompt forbids inventing a drawing question', () => {
  it('tells the model to omit the section when the sheet is missing', () => {
    expect(AI_PROMPT_TEMPLATE).toContain('Never invent a drawing question');
    expect(AI_PROMPT_TEMPLATE).toContain('omit the drawing section entirely');
  });

  it('names the exact strings that ended up in production', () => {
    // Naming them matters. A general "do not invent" was not enough guidance
    // for a model staring at a paper that says Part III has two questions.
    expect(AI_PROMPT_TEMPLATE).toContain('Drawing question 1');
    expect(AI_PROMPT_TEMPLATE).toContain('Drawing Test Question 2');
  });

  it('gives the Hindi prompt the same instruction rather than an ambiguous choice', () => {
    // It used to read "omit entirely or set question_text_hi to the drawing
    // prompt in Hindi", and an "or" with no condition attached is an invitation
    // to guess.
    expect(HINDI_AI_PROMPT_TEMPLATE).toContain('Never write a stand-in');
    expect(HINDI_AI_PROMPT_TEMPLATE).not.toContain('omit entirely or set question_text_hi');
  });

  it('does not tell the model to write to a field the schema has no room for', () => {
    // An earlier draft of this rule pointed at `paper.notes`, which does not
    // exist on BulkUploadJSON. An instruction to fill a field that is dropped
    // on parse is worse than no instruction.
    expect(AI_PROMPT_TEMPLATE).not.toContain('paper.notes');
  });
});
