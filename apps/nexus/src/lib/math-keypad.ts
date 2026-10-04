/**
 * What each key on the maths keypad does to the answer being typed.
 *
 * A phone's decimal keyboard has digits, a point and a minus, and nothing for
 * a fraction or a root. The keypad fills that gap. Its keys insert plain
 * characters the answer reader (parseMathAnswer in @neram/database) already
 * understands, so what the student sees in the box is exactly what is saved
 * and graded: `3/4`, `2√(3)`, `π/2`.
 *
 * Kept pure, with the cursor passed in and handed back, so the behaviour is
 * tested here and the component only has to put the cursor where it is told.
 */

export type MathKey = 'fraction' | 'sqrt' | 'pi' | 'open' | 'close' | 'power' | 'minus' | 'backspace';

export interface MathKeyDef {
  key: MathKey;
  /** What the key shows. Plain characters, never an emoji. */
  label: string;
  /** What a screen reader says. */
  ariaLabel: string;
}

/** In keypad order: the two the decimal keyboard lacks most come first. */
export const MATH_KEYS: readonly MathKeyDef[] = [
  { key: 'fraction', label: 'a/b', ariaLabel: 'Fraction' },
  { key: 'sqrt', label: '√', ariaLabel: 'Square root' },
  { key: 'pi', label: 'π', ariaLabel: 'Pi' },
  { key: 'power', label: 'xʸ', ariaLabel: 'Power' },
  { key: 'open', label: '(', ariaLabel: 'Open bracket' },
  { key: 'close', label: ')', ariaLabel: 'Close bracket' },
  { key: 'minus', label: '−', ariaLabel: 'Minus' },
  { key: 'backspace', label: '⌫', ariaLabel: 'Delete' },
];

export interface KeypadEdit {
  value: string;
  /** Where the cursor goes after the edit. */
  caret: number;
}

/** Same cap as the answer reader: anything longer would never be graded. */
export const MATH_INPUT_MAX_LENGTH = 40;

function insert(value: string, start: number, end: number, text: string, caretOffset = text.length): KeypadEdit {
  const next = value.slice(0, start) + text + value.slice(end);
  if (next.length > MATH_INPUT_MAX_LENGTH) return { value, caret: end };
  return { value: next, caret: start + caretOffset };
}

/**
 * Apply one key press to `value`, whose selection runs from `start` to `end`
 * (equal when nothing is selected). Out-of-range positions are clamped, since
 * a cleared input can report a stale selection.
 */
export function applyMathKey(value: string, start: number, end: number, key: MathKey): KeypadEdit {
  const len = value.length;
  const from = Math.max(0, Math.min(start, end, len));
  const to = Math.max(from, Math.min(Math.max(start, end), len));

  switch (key) {
    case 'fraction':
      return insert(value, from, to, '/');
    case 'pi':
      return insert(value, from, to, 'π');
    case 'power':
      return insert(value, from, to, '^');
    case 'open':
      return insert(value, from, to, '(');
    case 'close':
      return insert(value, from, to, ')');
    case 'minus':
      return insert(value, from, to, '-');
    case 'sqrt': {
      // A selection goes inside the root: select "3", press √, get √(3).
      const selected = value.slice(from, to);
      if (selected) return insert(value, from, to, `√(${selected})`);
      // Otherwise the brackets come with it and the cursor waits between them.
      return insert(value, from, to, '√()', 2);
    }
    case 'backspace': {
      if (to > from) return { value: value.slice(0, from) + value.slice(to), caret: from };
      if (from === 0) return { value, caret: 0 };
      // An empty pair the √ key left behind goes in one press, root and all.
      if (value.slice(from - 2, from + 1) === '√()') {
        return { value: value.slice(0, from - 2) + value.slice(from + 1), caret: from - 2 };
      }
      return { value: value.slice(0, from - 1) + value.slice(from), caret: from - 1 };
    }
  }
}
