import { describe, it, expect } from 'vitest';
import { parseMathAnswer } from '@neram/database';
import { applyMathKey, MATH_KEYS, MATH_INPUT_MAX_LENGTH } from './math-keypad';

describe('applyMathKey', () => {
  it('inserts at the cursor, not at the end', () => {
    expect(applyMathKey('34', 1, 1, 'fraction')).toEqual({ value: '3/4', caret: 2 });
  });

  it('replaces a selection', () => {
    expect(applyMathKey('3x4', 1, 2, 'fraction')).toEqual({ value: '3/4', caret: 2 });
  });

  it('opens a root with the cursor inside its brackets', () => {
    expect(applyMathKey('2', 1, 1, 'sqrt')).toEqual({ value: '2√()', caret: 3 });
  });

  it('wraps a selection in the root', () => {
    expect(applyMathKey('23', 1, 2, 'sqrt')).toEqual({ value: '2√(3)', caret: 5 });
  });

  it('deletes an empty root in one press', () => {
    expect(applyMathKey('2√()', 3, 3, 'backspace')).toEqual({ value: '2', caret: 1 });
  });

  it('deletes one character, or the selection', () => {
    expect(applyMathKey('3/4', 3, 3, 'backspace')).toEqual({ value: '3/', caret: 2 });
    expect(applyMathKey('3/4', 1, 3, 'backspace')).toEqual({ value: '3', caret: 1 });
    expect(applyMathKey('', 0, 0, 'backspace')).toEqual({ value: '', caret: 0 });
  });

  it('clamps a stale selection on a cleared input', () => {
    expect(applyMathKey('', 5, 5, 'pi')).toEqual({ value: 'π', caret: 1 });
  });

  it('refuses to grow past the length the grader reads', () => {
    const full = '1'.repeat(MATH_INPUT_MAX_LENGTH);
    expect(applyMathKey(full, full.length, full.length, 'pi').value).toBe(full);
  });

  it('builds answers the grader can read', () => {
    // Typing 2, √, 3 on the keypad.
    let edit = applyMathKey('2', 1, 1, 'sqrt');
    edit = { value: edit.value.slice(0, edit.caret) + '3' + edit.value.slice(edit.caret), caret: edit.caret + 1 };
    expect(edit.value).toBe('2√(3)');
    expect(parseMathAnswer(edit.value)?.value).toBeCloseTo(2 * Math.sqrt(3), 12);

    expect(parseMathAnswer(applyMathKey('34', 1, 1, 'fraction').value)?.value).toBe(0.75);
    expect(parseMathAnswer(applyMathKey('', 0, 0, 'pi').value + '/2')?.value).toBeCloseTo(Math.PI / 2, 12);
  });

  it('labels every key for screen readers', () => {
    for (const k of MATH_KEYS) expect(k.ariaLabel.length).toBeGreaterThan(0);
  });
});
