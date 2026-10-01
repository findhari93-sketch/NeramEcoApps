import { describe, expect, it } from 'vitest';
import { answerPlan, askSpec, normalizeNumeric, normalizeText } from './answer-plan';

const four = (extra: Array<Record<string, unknown>> = []) => [
  { id: 'a', text: 'Arch' },
  { id: 'b', text: 'Dome' },
  { id: 'c', text: 'Beam' },
  { id: 'd', text: 'Truss' },
  ...extra,
];

describe('answerPlan: multiple choice', () => {
  it("reads the key from the option's id", () => {
    expect(answerPlan({ question_format: 'MCQ', options: four(), correct_answer: 'c' })).toEqual({
      type: 'mcq',
      optionCount: 4,
      keys: ['C'],
      keyFrom: 'option_id',
    });
  });

  it("reads the key from the option's NTA id", () => {
    const options = four().map((o, i) => ({ ...o, id: `opt${i}`, nta_id: `4135${i}` }));
    expect(answerPlan({ question_format: 'MCQ', options, correct_answer: '41352' })).toMatchObject({ keys: ['C'], keyFrom: 'nta_id' });
  });

  it('reads the key from the one option marked correct when the key names none', () => {
    const options = [{ text: 'Arch' }, { text: 'Dome', is_correct: true }, { text: 'Beam' }];
    expect(answerPlan({ question_format: 'MCQ', options, correct_answer: '' })).toMatchObject({ optionCount: 3, keys: ['B'], keyFrom: 'is_correct' });
  });

  it('reads a bare letter within the options', () => {
    const options = [{ text: 'Arch' }, { text: 'Dome' }, { text: 'Beam' }, { text: 'Truss' }];
    expect(answerPlan({ question_format: 'MCQ', options, correct_answer: 'D' })).toMatchObject({ keys: ['D'], keyFrom: 'letter' });
  });

  it("reads the option's own text, when exactly one option has it", () => {
    const options = [{ text: 'Red Fort' }, { text: 'Gwalior  Fort' }, { text: 'Agra Fort' }];
    expect(answerPlan({ question_format: 'MCQ', options, correct_answer: 'gwalior fort' })).toMatchObject({ keys: ['B'], keyFrom: 'option_text' });
  });

  it('gives no key for a number that is not an option id: "4" on three options', () => {
    const options = [{ id: '1', text: 'x' }, { id: '2', text: 'y' }, { id: '3', text: 'z' }];
    expect(answerPlan({ question_format: 'MCQ', options, correct_answer: '4' })).toMatchObject({ type: 'mcq', optionCount: 3, keys: null });
  });

  it('gives no key for a letter beyond the options or two marked correct', () => {
    const options = [{ text: 'x', is_correct: true }, { text: 'y', is_correct: true }];
    expect(answerPlan({ question_format: 'MCQ', options, correct_answer: 'e' })).toMatchObject({ keys: null, keyFrom: null });
  });

  it('asks four buttons when the options are in the picture', () => {
    expect(answerPlan({ question_format: 'MCQ', options: [], correct_answer: 'b' })).toEqual({
      type: 'mcq',
      optionCount: 4,
      keys: ['B'],
      keyFrom: 'letter',
    });
    expect(answerPlan({ question_format: 'MCQ', options: null, correct_answer: 'x' })).toMatchObject({ optionCount: 4, keys: null });
  });

  it('shows a question with one option or more than six without asking', () => {
    expect(answerPlan({ question_format: 'MCQ', options: [{ text: 'only' }], correct_answer: 'a' })).toEqual({ type: 'show' });
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: String(i), text: String(i) }));
    expect(answerPlan({ question_format: 'MCQ', options: seven, correct_answer: '1' })).toEqual({ type: 'show' });
  });
});

describe('answerPlan: values, pictures and drawings', () => {
  it('asks a number for a numerical question, normalised', () => {
    expect(answerPlan({ question_format: 'NUMERICAL', options: null, correct_answer: '012.50' })).toEqual({
      type: 'numeric',
      keys: ['12.5'],
      keyFrom: 'value',
    });
  });

  it('asks short text for a ratio, tight and spaced', () => {
    expect(answerPlan({ question_format: 'NUMERICAL', options: null, correct_answer: '2:3' })).toEqual({
      type: 'text',
      keys: ['2:3', '2 : 3'],
      keyFrom: 'value',
    });
  });

  it('asks a number with no key when the stored answer is not one', () => {
    expect(answerPlan({ question_format: 'NUMERICAL', options: null, correct_answer: '~12' })).toEqual({
      type: 'numeric',
      keys: null,
      keyFrom: null,
    });
  });

  it('treats a picture question with options as multiple choice, without as a value', () => {
    expect(answerPlan({ question_format: 'IMAGE_BASED', options: four(), correct_answer: 'a' })).toMatchObject({ type: 'mcq', keys: ['A'] });
    expect(answerPlan({ question_format: 'IMAGE_BASED', options: null, correct_answer: '7' })).toMatchObject({ type: 'numeric', keys: ['7'] });
  });

  it('only shows a drawing question', () => {
    expect(answerPlan({ question_format: 'DRAWING_PROMPT', options: null, correct_answer: '' })).toEqual({ type: 'show' });
  });
});

describe('askSpec', () => {
  const mcq = answerPlan({ question_format: 'MCQ', options: four(), correct_answer: 'd' });

  it("follows the plan when the teacher keeps the bank's buttons", () => {
    expect(askSpec(mcq)).toEqual({ answerType: 'mcq', optionCount: 4, suggestedKeys: ['D'] });
    expect(askSpec({ type: 'show' })).toBeNull();
  });

  it('drops a key beyond fewer options, and a key of another type', () => {
    expect(askSpec(mcq, { answerType: 'mcq', optionCount: 3 })).toEqual({ answerType: 'mcq', optionCount: 3, suggestedKeys: null });
    expect(askSpec(mcq, { answerType: 'mcq', optionCount: 5 })).toEqual({ answerType: 'mcq', optionCount: 5, suggestedKeys: ['D'] });
    expect(askSpec(mcq, { answerType: 'yesno', optionCount: null })).toEqual({ answerType: 'yesno', optionCount: null, suggestedKeys: null });
  });

  it('lets the teacher ask a drawing question as a poll', () => {
    expect(askSpec({ type: 'show' }, { answerType: 'yesno', optionCount: null })).toEqual({
      answerType: 'yesno',
      optionCount: null,
      suggestedKeys: null,
    });
  });
});

describe('normalisers', () => {
  it.each([
    ['012.50', '12.5'],
    ['-0', '0'],
    ['1,000', '1000'],
    ['+3.0', '3'],
    ['.5', '0.5'],
    ['abc', null],
    ['', null],
  ])('numeric %s is %s', (raw, out) => {
    expect(normalizeNumeric(raw)).toBe(out);
  });

  it('text drops case, spacing and a closing full stop', () => {
    expect(normalizeText('  Gwalior   Fort. ')).toBe('gwalior fort');
    expect(normalizeText('   ')).toBeNull();
  });
});
