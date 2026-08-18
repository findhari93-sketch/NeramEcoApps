import { describe, it, expect } from 'vitest';
import { suggestSection } from './qb-collision-suggestion';

describe('suggestSection', () => {
  it('format vetoes to drawing regardless of category', () => {
    expect(suggestSection({
      question_format: 'DRAWING_PROMPT',
      question_text: 'Draw a proportionate sketch',
      categories: ['mathematics'],
    })).toBe('drawing');
  });

  it('format vetoes to math_numerical regardless of category', () => {
    expect(suggestSection({
      question_format: 'NUMERICAL',
      question_text: 'Find the value of x',
      categories: ['aptitude'],
    })).toBe('math_numerical');
  });

  it('reads the broad "mathematics" category', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['mathematics'],
    })).toBe('math_mcq');
  });

  it('reads the broad "aptitude" category', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['aptitude'],
    })).toBe('aptitude');
  });

  it('reads a maths subcategory (differential_equations -> Calculus group)', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['differential_equations'],
    })).toBe('math_mcq');
  });

  it('reads an aptitude subcategory (architecture_gk -> Aptitude Topics group)', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['architecture_gk'],
    })).toBe('aptitude');
  });

  it('reads a NATA-topics subcategory (planning -> NATA Topics group)', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['planning'],
    })).toBe('aptitude');
  });

  it('falls back to the text classifier when categories give no signal', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'The least positive integral value of $\\lambda$ such that $10^{50} + \\lambda$ is divisible by 9',
      categories: [],
    })).toBe('math_mcq');
  });

  it('returns null when nothing gives a usable signal, rather than guessing', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'What is the answer?',
      categories: [],
    })).toBeNull();
  });
});
