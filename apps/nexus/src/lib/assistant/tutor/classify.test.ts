import { describe, expect, it } from 'vitest';
import { classifyReply } from './classify';

describe('classifyReply', () => {
  it.each([
    ['b', 3, { kind: 'choice', index: 1 }],
    ['(C)', 3, { kind: 'choice', index: 2 }],
    ['option a', 4, { kind: 'choice', index: 0 }],
    ['d', 3, { kind: 'unknown' }],
  ])('reads %s with %i choices as a letter', (text, n, want) => {
    expect(classifyReply(text, n)).toEqual(want);
  });

  it('does not read a letter as a choice when no check is open', () => {
    expect(classifyReply('a', 0).kind).toBe('unknown');
  });

  it.each([
    ['5', '5'],
    ['-1', '-1'],
    ['x = 3/4', '3/4'],
    ['the answer is 2√3', '2√3'],
    ['\\frac{1}{2}', '\\frac{1}{2}'],
    ['3.5.', '3.5'],
  ])('reads %s as the value %s', (text, raw) => {
    expect(classifyReply(text, 0)).toEqual({ kind: 'value', raw });
  });

  it.each([
    ['why?', 'why'],
    ['How come', 'why'],
    ["I don't understand", 'stuck'],
    ['no idea', 'stuck'],
    ['give me a hint', 'stuck'],
    ['show me the solution', 'show'],
    ["what's the answer", 'show'],
    ['skip', 'skip'],
  ])('reads %s as %s', (text, kind) => {
    expect(classifyReply(text, 3).kind).toBe(kind);
  });

  it('leaves real sentences to the model', () => {
    expect(classifyReply('I multiplied i by j and got zero, is that right', 3).kind).toBe('unknown');
    expect(classifyReply('because the vectors are perpendicular', 0).kind).toBe('unknown');
    expect(classifyReply('', 3).kind).toBe('unknown');
  });
});
