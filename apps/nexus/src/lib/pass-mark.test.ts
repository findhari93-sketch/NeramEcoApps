import { describe, it, expect } from 'vitest';
import { describePassMark, passMarkChoices } from './pass-mark';

/**
 * What "to pass" means for one checkpoint, said the way the server grades it.
 *
 * The old editor's helper said "Blank = all". The server never did that: a blank
 * pass mark is filled from the recording's pass percentage of the questions
 * served. These say the real number.
 */

const gate = { questions_per_segment: 10, pass_percentage: 70 };
const questions = (n: number) => Array.from({ length: n }, () => ({}));

describe('describePassMark', () => {
  it('works a blank pass mark out from the percentage of the questions served', () => {
    expect(describePassMark({ min_questions_to_pass: null, questions: questions(12) }, gate)).toEqual({
      serve: 10,
      minToPass: 7,
      label: '7 of 10 to pass',
    });
  });

  it('honours a pass mark the teacher set', () => {
    expect(describePassMark({ min_questions_to_pass: 5, questions: questions(12) }, gate).label).toBe('5 of 10 to pass');
  });

  it('serves only the questions a checkpoint has', () => {
    expect(describePassMark({ min_questions_to_pass: null, questions: questions(4) }, gate).serve).toBe(4);
  });
});

describe('passMarkChoices', () => {
  it('leads with the default, and says what the default is', () => {
    const [first] = passMarkChoices(12, gate);
    expect(first).toEqual({ value: null, label: 'Default: 7 of 10 (70%)' });
  });

  it('offers every count up to the number of questions served', () => {
    const choices = passMarkChoices(12, gate);
    expect(choices).toHaveLength(11);
    expect(choices[choices.length - 1]).toEqual({ value: 10, label: '10 of 10' });
  });
});
