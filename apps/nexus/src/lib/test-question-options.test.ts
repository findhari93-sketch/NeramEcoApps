import { describe, it, expect } from 'vitest';
import { describeFieldValue, isCorrectOption, optionLetter } from './test-question-options';

const options = [
  { id: 'a', text: 'Iron Age civilization' },
  { id: 'b', text: 'Bronze Age civilization' },
  { id: 'c', text: 'Stone Age civilization' },
  { id: 'd', text: 'Copper Age civilization' },
];

describe('isCorrectOption', () => {
  it('matches the stored key by id, whatever its case', () => {
    expect(isCorrectOption(options[1], 1, 'b')).toBe(true);
    expect(isCorrectOption(options[1], 1, 'B')).toBe(true);
    expect(isCorrectOption(options[0], 0, 'b')).toBe(false);
  });

  it('falls back to the position letter for an option with no id', () => {
    expect(isCorrectOption({ text: 'Third' }, 2, 'c')).toBe(true);
  });

  it('is never correct when there is no key', () => {
    expect(isCorrectOption(options[0], 0, null)).toBe(false);
  });
});

describe('optionLetter', () => {
  it('prints the option\'s own label, else A, B, C by position', () => {
    expect(optionLetter({ label: 'P' }, 0)).toBe('P');
    expect(optionLetter({}, 3)).toBe('D');
  });
});

describe('describeFieldValue', () => {
  it('names the option an answer key points at', () => {
    expect(describeFieldValue('correct_answer', 'b', options)).toBe('B. Bronze Age civilization');
  });

  it('shows a key it cannot place as it is stored', () => {
    expect(describeFieldValue('correct_answer', 'z', options)).toBe('z');
  });

  it('reads an options list as one line', () => {
    expect(describeFieldValue('options', options.slice(0, 2), null)).toBe(
      'A. Iron Age civilization   B. Bronze Age civilization',
    );
  });

  it('passes text through and reports an empty value as nothing', () => {
    expect(describeFieldValue('explanation_brief', 'It flourished in the Bronze Age.', null)).toBe(
      'It flourished in the Bronze Age.',
    );
    expect(describeFieldValue('explanation_brief', '', null)).toBeNull();
    expect(describeFieldValue('explanation_brief', null, null)).toBeNull();
  });
});
