import { describe, it, expect } from 'vitest';
import { parseMathAnswer, mathAnswersMatch, formatMathValue } from './math-answer';

function value(input: string): number | undefined {
  return parseMathAnswer(input)?.value;
}

describe('parseMathAnswer: plain numbers', () => {
  it('reads integers, decimals, signs and scientific notation', () => {
    expect(value('42')).toBe(42);
    expect(value('-0.5')).toBe(-0.5);
    expect(value('-.5')).toBe(-0.5);
    expect(value('+3')).toBe(3);
    expect(value(' 3.0 ')).toBe(3);
    expect(value('1e2')).toBe(100);
  });

  it('marks plain numbers as plain and formulas as not', () => {
    expect(parseMathAnswer('3.46')?.isPlainNumber).toBe(true);
    expect(parseMathAnswer('-2')?.isPlainNumber).toBe(true);
    expect(parseMathAnswer('1/3')?.isPlainNumber).toBe(false);
    expect(parseMathAnswer('2√3')?.isPlainNumber).toBe(false);
    expect(parseMathAnswer('π')?.isPlainNumber).toBe(false);
  });

  it('turns -0 into 0', () => {
    expect(Object.is(value('-0'), 0)).toBe(true);
  });
});

describe('parseMathAnswer: formulas students type on the keypad', () => {
  it('reads fractions', () => {
    expect(value('3/4')).toBe(0.75);
    expect(value('-1/2')).toBe(-0.5);
    expect(value('10/63')).toBeCloseTo(0.15873, 5);
  });

  it('reads square roots, bare and bracketed', () => {
    expect(value('√4')).toBe(2);
    expect(value('√(9+16)')).toBe(5);
    expect(value('sqrt(2)')).toBeCloseTo(Math.SQRT2, 12);
    expect(value('SQRT(2)')).toBeCloseTo(Math.SQRT2, 12);
  });

  it('multiplies implicitly the way maths is written', () => {
    expect(value('2√3')).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(value('3π')).toBeCloseTo(3 * Math.PI, 12);
    expect(value('2(1+√2)')).toBeCloseTo(2 * (1 + Math.SQRT2), 12);
    expect(value('(1+2)(3+4)')).toBe(21);
  });

  it('reads π in every spelling', () => {
    expect(value('π')).toBeCloseTo(Math.PI, 12);
    expect(value('pi/2')).toBeCloseTo(Math.PI / 2, 12);
    expect(value('\\pi')).toBeCloseTo(Math.PI, 12);
  });

  it('reads powers, including negative ones', () => {
    expect(value('2^10')).toBe(1024);
    expect(value('2^-1')).toBe(0.5);
    expect(value('-2^2')).toBe(-4);
  });

  it('honours precedence', () => {
    expect(value('1+2*3')).toBe(7);
    expect(value('(1+2)*3')).toBe(9);
    expect(value('6/2/3')).toBe(1);
    expect(value('2 - 3')).toBe(-1);
  });

  it('accepts the unicode signs phones and keypads produce', () => {
    expect(value('6÷4')).toBe(1.5);
    expect(value('2×3')).toBe(6);
    expect(value('2·3')).toBe(6);
    expect(value('−5')).toBe(-5);
    expect(value('5–2')).toBe(3);
  });
});

describe('parseMathAnswer: LaTeX a teacher may paste', () => {
  it('reads \\frac, \\sqrt and \\sqrt[n]', () => {
    expect(value('\\frac{3}{4}')).toBe(0.75);
    expect(value('\\dfrac{1}{2}')).toBe(0.5);
    expect(value('\\sqrt{2}')).toBeCloseTo(Math.SQRT2, 12);
    expect(value('\\sqrt[3]{8}')).toBeCloseTo(2, 12);
    expect(value('\\sqrt[3]{-8}')).toBeCloseTo(-2, 12);
    expect(value('\\frac{\\pi}{2}')).toBeCloseTo(Math.PI / 2, 12);
    expect(value('2\\times 3')).toBe(6);
    expect(value('\\left(1+2\\right)\\cdot 2')).toBe(6);
  });
});

describe('parseMathAnswer: what it refuses', () => {
  it.each([
    [''],
    ['   '],
    ['2:3'],
    ['5cm'],
    ['abc'],
    ['NaN'],
    ['Infinity'],
    ['--5'],
    ['(1+2'],
    ['1+2)'],
    ['1/0'],
    ['\\frac{1}{0}'],
    ['√-4'],
    ['\\sqrt[2.5]{8}'],
    ['10^400'],
    ['2 3 +'],
    ['1,000'],
    ['50%'],
    ['0x10'],
    ['[2]'],
    ['1'.repeat(41)],
  ])('returns null for %j', (input) => {
    expect(parseMathAnswer(input)).toBeNull();
  });

  it('never runs code, however the input is dressed up', () => {
    expect(parseMathAnswer('alert(1)')).toBeNull();
    expect(parseMathAnswer('constructor')).toBeNull();
    expect(parseMathAnswer('this')).toBeNull();
  });

  it('handles null and undefined', () => {
    expect(parseMathAnswer(null)).toBeNull();
    expect(parseMathAnswer(undefined)).toBeNull();
  });
});

describe('parseMathAnswer: LaTeX output for the preview', () => {
  it('renders the common shapes', () => {
    expect(parseMathAnswer('3/4')?.latex).toBe('\\frac{3}{4}');
    expect(parseMathAnswer('2√3')?.latex).toBe('2\\sqrt{3}');
    expect(parseMathAnswer('√(2+1)')?.latex).toBe('\\sqrt{2 + 1}');
    expect(parseMathAnswer('π/2')?.latex).toBe('\\frac{\\pi}{2}');
    expect(parseMathAnswer('(1+2)/3')?.latex).toBe('\\frac{1 + 2}{3}');
    expect(parseMathAnswer('2^10')?.latex).toBe('{2}^{10}');
    expect(parseMathAnswer('\\sqrt[3]{8}')?.latex).toBe('\\sqrt[3]{8}');
  });

  it('keeps a visible sign between two numbers', () => {
    expect(parseMathAnswer('2*3')?.latex).toBe('2 \\times 3');
  });
});

describe('mathAnswersMatch', () => {
  const p = (s: string) => {
    const parsed = parseMathAnswer(s);
    if (!parsed) throw new Error(`could not parse ${s}`);
    return parsed;
  };

  it('treats equal values as equal, whatever their form', () => {
    expect(mathAnswersMatch(p('0.5'), p('1/2'))).toBe(true);
    expect(mathAnswersMatch(p('4/6'), p('2/3'))).toBe(true);
    expect(mathAnswersMatch(p('√2·√2'), p('2'))).toBe(true);
    expect(mathAnswersMatch(p('\\frac{1}{2}'), p('1/2'))).toBe(true);
  });

  it('accepts a two-place decimal for a formula key when no tolerance is set', () => {
    expect(mathAnswersMatch(p('3.46'), p('2√3'))).toBe(true);
    expect(mathAnswersMatch(p('3.464'), p('2√3'))).toBe(true);
    expect(mathAnswersMatch(p('0.33'), p('1/3'))).toBe(true);
    expect(mathAnswersMatch(p('3.4'), p('2√3'))).toBe(false);
    expect(mathAnswersMatch(p('3.47'), p('2√3'))).toBe(false);
  });

  it('does not loosen a decimal key', () => {
    // The teacher keyed 3.46 exactly. A formula worth 3.4641 is not 3.46.
    expect(mathAnswersMatch(p('2√3'), p('3.46'))).toBe(false);
    expect(mathAnswersMatch(p('3.461'), p('3.46'))).toBe(false);
  });

  it('does not let a formula answer creep in on the slack', () => {
    // Slack is for typed decimals only. √12.01 is a different formula.
    expect(mathAnswersMatch(p('√12.01'), p('2√3'))).toBe(false);
  });

  it('uses the tolerance when one is set, and its magnitude', () => {
    expect(mathAnswersMatch(p('3.5'), p('2√3'), 0.05)).toBe(true);
    expect(mathAnswersMatch(p('3.5'), p('2√3'), -0.05)).toBe(true);
    expect(mathAnswersMatch(p('3.6'), p('2√3'), 0.05)).toBe(false);
  });
});

describe('formatMathValue', () => {
  it('keeps whole numbers whole and trims long decimals', () => {
    expect(formatMathValue(5)).toBe('5');
    expect(formatMathValue(2 * Math.sqrt(3))).toBe('3.4641');
    expect(formatMathValue(0.5)).toBe('0.5');
  });
});
