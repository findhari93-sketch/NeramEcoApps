import { describe, it, expect } from 'vitest';
import {
  buildSolutionPrompt,
  getMediumFromCategory,
  PROMPT_TYPE_LABELS,
  type DrawingQuestionBrief,
} from './drawing-prompt-templates';

/**
 * The model-solution prompt.
 *
 * In-app AI evaluation of drawings is deliberately off: /api/drawing/ai-feedback
 * is a 410 stub and the module works by having a teacher paste a generated
 * prompt into Gemini by hand. Authoring a solution image follows the same road,
 * so this is a fourth prompt in the same file, not a new mechanism and not a
 * new line of AI spend.
 *
 * The prompt is READ BY A HUMAN before it is pasted, so the house style rules
 * about punctuation apply to its output, not just to the source.
 *
 * Colour rule, design principle, objects to include and focus points used to
 * feed this prompt too. Nobody was authoring them, so DrawingQuestionBrief no
 * longer carries them: the brief is now just the question text, the marks,
 * and the category that picks a default medium.
 */

const FULL: DrawingQuestionBrief = {
  question_text: 'Create a composition using square, circle and triangle for TECHNOLOGY.',
  drawing_marks: 50,
  category: '2d_composition',
};

describe('buildSolutionPrompt', () => {
  it('carries the question text through verbatim', () => {
    expect(buildSolutionPrompt(FULL)).toContain(
      'Create a composition using square, circle and triangle for TECHNOLOGY.',
    );
  });

  it('carries the marks', () => {
    const out = buildSolutionPrompt(FULL);
    expect(out).toContain('MARKS: 50');
  });

  it('picks the medium from the category when none is given', () => {
    // kit_sculpture is charcoal in getMediumFromCategory; a composition is graphite.
    expect(buildSolutionPrompt({ ...FULL, category: 'kit_sculpture' })).toContain('Charcoal Pencil');
    expect(buildSolutionPrompt({ ...FULL, category: '2d_composition' })).toContain('Graphite Pencil');
    expect(getMediumFromCategory('kit_sculpture')).toBe('charcoal_pencil');
  });

  it('lets an explicit medium override the category', () => {
    expect(buildSolutionPrompt(FULL, 'expert', 'color_pencil')).toContain('Color Pencil');
  });

  it('forbids annotations on the image, unlike the annotation prompt', () => {
    // The whole point of a model solution is that it is a clean answer. An
    // image covered in red arrows is the OTHER prompt in this file.
    expect(buildSolutionPrompt(FULL)).toContain('No text labels');
  });

  it('closes with the same single-image instruction as the reference prompt', () => {
    // Gemini returns one image per response, which is why these are separate
    // prompts at all. A teacher who learned that from the review screen should
    // not have to relearn it here.
    expect(buildSolutionPrompt(FULL)).toContain('OUTPUT: Generate a single model answer image.');
  });

  it('survives a question that has nothing filled in yet', () => {
    const out = buildSolutionPrompt({ question_text: null });
    expect(out).toContain('(no question text yet)');
    expect(out).not.toContain('MARKS:');
  });

  it('contains no em dash and no double dash, because a human reads it', () => {
    const out = buildSolutionPrompt(FULL);
    expect(out).not.toContain('—');
    expect(out).not.toMatch(/ -- /);
  });
});

describe('PROMPT_TYPE_LABELS', () => {
  it('has an entry for the new prompt, so the UI can name it', () => {
    // The type is a union and the record is keyed by it, so a missing entry is
    // a compile error rather than a blank button. This asserts the content.
    expect(PROMPT_TYPE_LABELS.solution.label).toBe('Model Solution');
  });
});
