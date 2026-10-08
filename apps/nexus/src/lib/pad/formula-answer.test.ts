import { describe, expect, it } from 'vitest';
import { isFormulaValue, isPlainNumber, padAnswerCorrect, padDecimal, shortFormulaValue, shownAnswer } from './formula-answer';
import { formulaValue } from './formula-value';
import { normalizeNumeric } from '@/lib/qb-present/answer-plan';

describe('formulaValue', () => {
  it('reads a formula into the decimal the pad stores', () => {
    expect(formulaValue('2√3')).toBe('3.46410161514');
    expect(formulaValue('2*sqrt(3)')).toBe('3.46410161514');
    expect(formulaValue('\\frac{\\pi}{2}')).toBe('1.57079632679');
    expect(formulaValue('3/4')).toBe('0.75');
  });

  it('lands every way of writing one value on the same text', () => {
    expect(formulaValue('4/6')).toBe(formulaValue('2/3'));
    expect(formulaValue('√2*√2')).toBe('2');
    expect(formulaValue('-0')).toBe('0');
  });

  it('gives nothing for what is not a number', () => {
    for (const raw of ['2:3', '5cm', 'abc', '', '1/0', '√(-1)']) expect(formulaValue(raw)).toBeNull();
  });

  it('always writes something pad_normalize takes as a number', () => {
    for (const raw of ['2√3', 'π', '1/3', '-7/8', '10^6', '1e2', '22/7']) {
      const value = formulaValue(raw)!;
      expect(normalizeNumeric(value)).toBe(value);
    }
  });
});

describe('padDecimal', () => {
  it('never writes an exponent', () => {
    expect(padDecimal(1e21)).toBeNull();
    expect(padDecimal(1e-9)).toBeNull();
    expect(padDecimal(123456789)).toBe('123456789');
    expect(padDecimal(Number.NaN)).toBeNull();
  });
});

describe('padAnswerCorrect (as pad_answer_correct grades)', () => {
  const twoRootThree = ['3.46410161514'];

  it('takes an equal answer, as before', () => {
    expect(padAnswerCorrect('mcq', 'B', ['B'])).toBe(true);
    expect(padAnswerCorrect('numeric', '12.5', ['12.5'])).toBe(true);
    expect(padAnswerCorrect('numeric', '3.46410161514', twoRootThree)).toBe(true);
  });

  it('takes a decimal within 0.005 of a formula key, as the question bank does', () => {
    expect(padAnswerCorrect('numeric', '3.46', twoRootThree)).toBe(true);
    expect(padAnswerCorrect('numeric', '3.464', twoRootThree)).toBe(true);
    expect(padAnswerCorrect('numeric', '3.47', twoRootThree)).toBe(false);
    expect(padAnswerCorrect('numeric', '3.4', twoRootThree)).toBe(false);
  });

  it('keeps a key typed as a decimal exact', () => {
    expect(padAnswerCorrect('numeric', '3.461', ['3.46'])).toBe(false);
    expect(padAnswerCorrect('numeric', '0.75', ['0.75'])).toBe(true);
  });

  it('never stretches a text answer, and needs a key', () => {
    expect(padAnswerCorrect('text', '3.46', twoRootThree)).toBe(false);
    expect(padAnswerCorrect('numeric', '3.46', null)).toBe(false);
  });
});

describe('what the screens show', () => {
  it('shortens a stored formula value', () => {
    expect(isFormulaValue('3.46410161514')).toBe(true);
    expect(isFormulaValue('3.464')).toBe(false);
    expect(shortFormulaValue('3.46410161514')).toBe('≈ 3.4641');
  });

  it("shows the student's own formula, and a plain number as stored", () => {
    expect(shownAnswer('numeric', '3.46410161514', '2√3')).toBe('2√3');
    expect(shownAnswer('numeric', '12.5', '012.50')).toBe('12.5');
    expect(shownAnswer('mcq', 'B', 'b')).toBe('B');
    expect(isPlainNumber('1,000')).toBe(true);
  });
});
