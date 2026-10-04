/**
 * Reads a numerical answer that may be written as a formula.
 *
 * Teachers key answers like `3/4`, `2√3` or `\frac{\pi}{2}`, and students type
 * them on a phone keypad that has no LaTeX. Both sides go through this one
 * reader so that grading, the live preview under the answer box and the answer
 * shown after a reveal can never disagree about what a string means.
 *
 * It is a small recursive-descent parser and never calls eval or Function.
 * Anything it does not understand returns null, and the grader falls back to
 * comparing text, which keeps ratio answers like `2:3` and unit answers like
 * `5cm` working exactly as before.
 *
 * Grammar (whitespace ignored):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary | <implicit ×> power)*
 *   unary   := ('+' | '-') unary | power
 *   power   := primary ('^' unary)?
 *   primary := number | π | '(' expr ')' | '{' expr '}'
 *            | √ primary | sqrt primary | \sqrt[n]{expr} | \frac{expr}{expr}
 */

export interface ParsedMathAnswer {
  /** The numeric value of the whole expression. Always finite. */
  value: number;
  /** A LaTeX rendering for the preview and for showing the answer back. */
  latex: string;
  /**
   * True when the input is just a decimal number, like `3`, `-0.5` or `1e2`.
   * False for anything written as a formula (`1/3`, `2√3`, `π`).
   */
  isPlainNumber: boolean;
}

/** Longer than any real answer, short enough that nothing can be abused. */
export const MATH_ANSWER_MAX_LENGTH = 40;

const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

type Token =
  | { kind: 'num'; text: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'open'; close: ')' | '}' | ']' }
  | { kind: 'close'; ch: ')' | '}' | ']' }
  | { kind: 'pi' }
  | { kind: 'sqrt' }
  | { kind: 'frac' };

type Node =
  | { t: 'num'; text: string }
  | { t: 'pi' }
  | { t: 'group'; inner: Node }
  | { t: 'neg'; inner: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node; implicit?: boolean }
  | { t: 'pow'; base: Node; exp: Node }
  | { t: 'root'; index: Node | null; inner: Node }
  | { t: 'frac'; num: Node; den: Node };

class ParseError extends Error {}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const WORDS: Array<[string, Token]> = [
  // Longest first, so `\sqrt` is not read as `\s` + `qrt`.
  ['\\sqrt', { kind: 'sqrt' }],
  ['\\frac', { kind: 'frac' }],
  ['\\dfrac', { kind: 'frac' }],
  ['\\tfrac', { kind: 'frac' }],
  ['\\times', { kind: 'op', op: '*' }],
  ['\\cdot', { kind: 'op', op: '*' }],
  ['\\div', { kind: 'op', op: '/' }],
  ['\\pi', { kind: 'pi' }],
  ['sqrt', { kind: 'sqrt' }],
  ['pi', { kind: 'pi' }],
];

/** LaTeX sizing commands carry no meaning for the value, so they are dropped. */
const IGNORED_COMMANDS = ['\\left', '\\right', '\\,', '\\;', '\\!', '\\ '];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = source;

  outer: while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    for (const cmd of IGNORED_COMMANDS) {
      if (s.startsWith(cmd, i)) {
        i += cmd.length;
        continue outer;
      }
    }

    // A number, with an optional exponent (`1e2`, because the old grader
    // accepted it and tests depend on that).
    const numMatch = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (numMatch) {
      tokens.push({ kind: 'num', text: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    for (const [word, token] of WORDS) {
      if (s.slice(i, i + word.length).toLowerCase() === word) {
        tokens.push(token);
        i += word.length;
        continue outer;
      }
    }

    switch (ch) {
      case '+':
        tokens.push({ kind: 'op', op: '+' });
        break;
      case '-':
      case '−': // minus sign
      case '–': // en dash, which phones substitute for a hyphen
        tokens.push({ kind: 'op', op: '-' });
        break;
      case '*':
      case '×': // ×
      case '·': // ·
      case '⋅': // ⋅
        tokens.push({ kind: 'op', op: '*' });
        break;
      case '/':
      case '÷': // ÷
        tokens.push({ kind: 'op', op: '/' });
        break;
      case '^':
        tokens.push({ kind: 'op', op: '^' });
        break;
      case '√': // √
        tokens.push({ kind: 'sqrt' });
        break;
      case 'π': // π
        tokens.push({ kind: 'pi' });
        break;
      case '(':
        tokens.push({ kind: 'open', close: ')' });
        break;
      case '{':
        tokens.push({ kind: 'open', close: '}' });
        break;
      case '[':
        tokens.push({ kind: 'open', close: ']' });
        break;
      case ')':
      case '}':
      case ']':
        tokens.push({ kind: 'close', ch });
        break;
      default:
        // Letters, ':', '%', units, anything else: not a formula.
        throw new ParseError(`unexpected ${ch}`);
    }
    i += 1;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new ParseError('empty');
    const node = this.expr();
    if (this.pos !== this.tokens.length) throw new ParseError('trailing input');
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new ParseError('unexpected end');
    this.pos += 1;
    return tok;
  }

  private isOp(op: string): boolean {
    const tok = this.peek();
    return tok?.kind === 'op' && tok.op === op;
  }

  /** True when the next token can start a primary, which allows `2√3`, `3π`, `2(1+√2)`. */
  private startsPrimary(): boolean {
    const tok = this.peek();
    if (!tok) return false;
    return (
      tok.kind === 'num' ||
      tok.kind === 'pi' ||
      tok.kind === 'sqrt' ||
      tok.kind === 'frac' ||
      (tok.kind === 'open' && tok.close !== ']')
    );
  }

  private expr(): Node {
    let node = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { op: '+' | '-' }).op;
      node = { t: 'bin', op, a: node, b: this.term() };
    }
    return node;
  }

  private term(): Node {
    let node = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.next() as { op: '*' | '/' }).op;
        node = { t: 'bin', op, a: node, b: this.unary() };
      } else if (this.startsPrimary()) {
        // Implicit multiplication never takes a sign: `2 -3` is subtraction.
        node = { t: 'bin', op: '*', a: node, b: this.power(), implicit: true };
      } else {
        return node;
      }
    }
  }

  private unary(): Node {
    if (this.isOp('-')) {
      this.next();
      // One sign per position. `--5` is a typo, not a number.
      if (this.isOp('-') || this.isOp('+')) throw new ParseError('double sign');
      return { t: 'neg', inner: this.power() };
    }
    if (this.isOp('+')) {
      this.next();
      if (this.isOp('-') || this.isOp('+')) throw new ParseError('double sign');
      return this.power();
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    if (this.isOp('^')) {
      this.next();
      return { t: 'pow', base, exp: this.unary() };
    }
    return base;
  }

  private group(close: ')' | '}' | ']'): Node {
    const inner = this.expr();
    const tok = this.next();
    if (tok.kind !== 'close' || tok.ch !== close) throw new ParseError('unbalanced');
    return inner;
  }

  private primary(): Node {
    const tok = this.next();
    switch (tok.kind) {
      case 'num':
        return { t: 'num', text: tok.text };
      case 'pi':
        return { t: 'pi' };
      case 'open':
        if (tok.close === ']') throw new ParseError('stray [');
        return { t: 'group', inner: this.group(tok.close) };
      case 'sqrt': {
        let index: Node | null = null;
        const after = this.peek();
        if (after?.kind === 'open' && after.close === ']') {
          this.next();
          index = this.group(']');
        }
        // `√3`, `√(2+1)`, `\sqrt{x}`. A bare √ applies to the next primary only,
        // so `√2π` is √2 · π, the way it is read aloud.
        const inner = this.primary();
        return { t: 'root', index, inner: unwrap(inner) };
      }
      case 'frac': {
        const num = this.primary();
        const den = this.primary();
        return { t: 'frac', num: unwrap(num), den: unwrap(den) };
      }
      default:
        throw new ParseError('unexpected token');
    }
  }
}

function unwrap(node: Node): Node {
  return node.t === 'group' ? node.inner : node;
}

// ---------------------------------------------------------------------------
// Evaluation and LaTeX
// ---------------------------------------------------------------------------

function evaluate(node: Node): number {
  switch (node.t) {
    case 'num':
      return Number(node.text);
    case 'pi':
      return Math.PI;
    case 'group':
      return evaluate(node.inner);
    case 'neg':
      return -evaluate(node.inner);
    case 'bin': {
      const a = evaluate(node.a);
      const b = evaluate(node.b);
      if (node.op === '+') return a + b;
      if (node.op === '-') return a - b;
      if (node.op === '*') return a * b;
      if (b === 0) return NaN;
      return a / b;
    }
    case 'pow':
      return Math.pow(evaluate(node.base), evaluate(node.exp));
    case 'frac': {
      const den = evaluate(node.den);
      if (den === 0) return NaN;
      return evaluate(node.num) / den;
    }
    case 'root': {
      const x = evaluate(node.inner);
      if (node.index === null) return Math.sqrt(x);
      const n = evaluate(node.index);
      if (!Number.isInteger(n) || n < 2) return NaN;
      // An odd root of a negative number is real: ∛(-8) = -2.
      if (x < 0) return n % 2 === 1 ? -Math.pow(-x, 1 / n) : NaN;
      return Math.pow(x, 1 / n);
    }
  }
}

function toLatex(node: Node): string {
  switch (node.t) {
    case 'num':
      return node.text;
    case 'pi':
      return '\\pi';
    case 'group':
      return `\\left(${toLatex(node.inner)}\\right)`;
    case 'neg':
      return `-${toLatex(node.inner)}`;
    case 'bin': {
      if (node.op === '/') return `\\frac{${toLatex(unwrap(node.a))}}{${toLatex(unwrap(node.b))}}`;
      const a = toLatex(node.a);
      const b = toLatex(node.b);
      if (node.op === '*') {
        // Two numbers side by side need a visible sign, or `2` `3` reads as 23.
        const needsSign = !node.implicit || (endsWithDigit(a) && startsWithDigit(b));
        return needsSign ? `${a} \\times ${b}` : `${a}${b}`;
      }
      return `${a} ${node.op} ${b}`;
    }
    case 'pow':
      return `{${toLatex(node.base)}}^{${toLatex(unwrap(node.exp))}}`;
    case 'frac':
      return `\\frac{${toLatex(node.num)}}{${toLatex(node.den)}}`;
    case 'root':
      return node.index === null
        ? `\\sqrt{${toLatex(node.inner)}}`
        : `\\sqrt[${toLatex(node.index)}]{${toLatex(node.inner)}}`;
  }
}

function endsWithDigit(s: string): boolean {
  return /[\d.]$/.test(s);
}

function startsWithDigit(s: string): boolean {
  return /^[\d.]/.test(s);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads `input` as a number or a formula. Returns null for anything that is
 * not one: empty, too long, a ratio, a unit, letters, unbalanced brackets,
 * division by zero, or a result that is not a finite real number.
 */
export function parseMathAnswer(input: string | null | undefined): ParsedMathAnswer | null {
  if (input == null) return null;
  const source = String(input).trim();
  if (source === '' || source.length > MATH_ANSWER_MAX_LENGTH) return null;

  let ast: Node;
  try {
    ast = new Parser(tokenize(source)).parse();
  } catch {
    return null;
  }

  const value = evaluate(ast);
  if (!Number.isFinite(value)) return null;

  return {
    // -0 shows as "0" everywhere else, so it should here too.
    value: Object.is(value, -0) ? 0 : value,
    latex: toLatex(ast),
    isPlainNumber: PLAIN_NUMBER.test(source.replace(/\s+/g, '')),
  };
}

/** Equal for every practical purpose: `4/6` and `2/3`, `√2·√2` and `2`. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * How far a typed decimal may sit from a formula key when the teacher set no
 * tolerance. NTA asks for decimals correct to two places, so a key of `2√3`
 * (3.4641…) accepts 3.46 and 3.464, but not 3.4 or 3.47.
 */
export const FORMULA_KEY_DECIMAL_SLACK = 0.005;

/**
 * Whether a student's answer matches the key, both already parsed.
 *
 * - With a tolerance, the values must sit within it.
 * - Without one, the values must be equal, so `0.5` matches `1/2` and `4/6`
 *   matches `2/3`.
 * - Without one, a formula key such as `2√3` also accepts a plain decimal that
 *   is correct to two places. Only the key's form matters here: a key keyed as
 *   a decimal (`3.46`) still needs the student's value to equal it.
 */
export function mathAnswersMatch(
  student: ParsedMathAnswer,
  key: ParsedMathAnswer,
  tolerance?: number | null,
): boolean {
  const tol = Math.abs(Number(tolerance) || 0);
  if (tol > 0) return Math.abs(student.value - key.value) <= tol + 1e-12;
  if (nearlyEqual(student.value, key.value)) return true;
  if (!key.isPlainNumber && student.isPlainNumber) {
    return Math.abs(student.value - key.value) <= FORMULA_KEY_DECIMAL_SLACK;
  }
  return false;
}

/**
 * A short decimal for "≈ 3.46" under a preview. Whole numbers show whole, and
 * nothing longer than four decimals is shown.
 */
export function formatMathValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toFixed(4));
  return String(rounded);
}
