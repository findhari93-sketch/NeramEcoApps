/**
 * Reads a typed reply without a model. Most replies to a tutor check are an
 * option letter, a number, "why", or "I'm stuck"; only what this cannot place
 * goes to Gemini (interpret.ts). Pure.
 */

export type Classified =
  | { kind: 'choice'; index: number }
  | { kind: 'value'; raw: string }
  | { kind: 'why' }
  | { kind: 'stuck' }
  | { kind: 'show' }
  | { kind: 'skip' }
  | { kind: 'unknown' };

const LETTER = /^\s*(?:option\s*)?\(?([a-e])\)?\s*[.)]?\s*$/i;
const WHY = /^\s*(why|how come|why\s*\?|but why|why is (that|it|this)|how\??)\s*\??\s*$/i;
const STUCK = /\b(i\s*(do\s*not|don'?t|dont)\s*(know|understand|get it)|idk|no idea|stuck|confused|not sure|help me|hint)\b/i;
const SHOW = /\b(show (me )?(the )?(full )?(solution|answer|working)|what('?s| is) the answer|tell me the answer|give (me )?the answer)\b/i;
const SKIP = /^\s*(skip|skip (it|this|the check)|later|not now)\s*$/i;
/** A number or a short formula: digits, operators, pi, sqrt, frac, brackets. */
const VALUE = /^\s*[-+]?[\d.(]|^\s*(\\?pi|π|√|\\sqrt|\\frac|sqrt)/i;

/**
 * @param text what the student typed
 * @param choiceCount choices on the open check (0 when it takes a number or nothing is open)
 */
export function classifyReply(text: string, choiceCount: number): Classified {
  const t = String(text || '').trim();
  if (!t) return { kind: 'unknown' };
  const letter = t.match(LETTER);
  if (letter && choiceCount > 0) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    if (index < choiceCount) return { kind: 'choice', index };
  }
  if (SKIP.test(t)) return { kind: 'skip' };
  if (WHY.test(t)) return { kind: 'why' };
  if (SHOW.test(t)) return { kind: 'show' };
  if (STUCK.test(t)) return { kind: 'stuck' };
  // "x = 5" and "it is 5" read as the value after the last = or "is".
  const tail = t.replace(/^.*(=|\bis\b|\banswer\b:?)\s*/i, '').replace(/[.\s]+$/, '').trim();
  const bare = tail.replace(/\\?sqrt|\\frac|\\?pi|\\cdot|\\times|[{}\\]/gi, '');
  if (tail.length <= 40 && VALUE.test(tail) && /^[\d\s.+\-*/^()×÷π√,]*$/.test(bare)) {
    return { kind: 'value', raw: tail };
  }
  return { kind: 'unknown' };
}
