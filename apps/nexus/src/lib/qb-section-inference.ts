import type { QBQuestionFormat, QBQuestionSection } from '@neram/database';

/**
 * Work out which section each question of a paper belongs to, by reading the
 * questions.
 *
 * WHY THIS EXISTS
 *
 * The old rule guessed purely from the question number, hardcoded to the
 * 2019-onwards JEE Paper 2 layout (Q1-20 maths MCQ, Q21-25 maths numerical,
 * Q26-75 aptitude, Q76+ drawing). Papers older than that are laid out
 * completely differently: the 2006 B.Arch paper runs 92 questions as maths
 * Q1-40, aptitude Q41-90, drawing Q91-92. Applied to that paper the old rule
 * called Q76-Q90 "drawing" (fifteen aptitude MCQs sent to a section that is
 * marked +50/0 and never auto-graded) and Q26-Q40 "aptitude" (fifteen maths
 * questions). Every one of those had to be fixed by hand, one dropdown at a
 * time.
 *
 * Position alone cannot know a paper's layout. The questions themselves can:
 * a maths question carries LaTeX and maths vocabulary, an architecture
 * aptitude question asks about answer figures, buildings and colour. So this
 * reads the text.
 *
 * WHAT IT GUARANTEES
 *
 *   - Format wins over everything. A DRAWING_PROMPT is drawing wherever it
 *     sits; a NUMERICAL is maths numerical. Conversely a four-option MCQ is
 *     NEVER placed in drawing or maths-numerical, because neither is a thing
 *     an MCQ can be. That single veto is what would have prevented both bugs.
 *   - Sections stay contiguous and in paper order, which is what
 *     qbPaperSectionRuns and the exam scheduler assume.
 *   - When the text gives no usable signal it returns null for that question
 *     rather than inventing a section. Unsectioned is loud in the UI (a
 *     warning strip a teacher acts on); a confident wrong guess is silent and
 *     ends up mismarking a real exam.
 */

export interface QBSectionInferenceInput {
  id: string;
  question_number: number | null;
  question_format: QBQuestionFormat;
  question_text: string | null;
  options?: { text?: string | null }[] | null;
}

export interface QBSectionInferenceResult {
  id: string;
  section: QBQuestionSection | null;
}

/**
 * Maths vocabulary that essentially never shows up in an architecture aptitude
 * question. Deliberately excludes shape words like "circle", "triangle" and
 * "plan", which are common in both halves of a B.Arch paper.
 */
const MATH_PATTERN = new RegExp(
  [
    // Words that take suffixes freely: equation/equations, integral/integrate,
    // coefficient/coefficients. Matching the stem plus \w* is what makes the
    // difference between catching "the system of equations" and missing it.
    /\b(?:equation|polynomial|coefficient|derivative|differenti|integra|determinant|hyperbola|parabola|ellipse|tangent|locus|loci|probabilit|permutation|combination|binomial|logarithm|trigonometr|theorem|inequalit|asymptote|eccentricit|vector|scalar|modulus|summation|factorial|subset|cardinalit|quadratic|centroid|matri(?:x|ces))\w*/i.source,
    // Phrases and closed forms.
    /\b(?:normal to|argument of|complex number|arithmetic progression|geometric progression|harmonic progression|limit of|continuous at|differentiable|maxima|minima|real roots?|imaginary)\b/i.source,
    // Bare maths tokens. Kept exactly bounded: `log\w*` would swallow
    // "logistics", and these almost always appear inside LaTeX anyway.
    /\b(?:A\.?P\.?|G\.?P\.?|H\.?P\.?|sin|cos|tan|cot|sec|cosec|log|lim)\b/.source,
  ].join('|'),
  'i',
);

/**
 * Architecture / aptitude vocabulary. These are the questions a B.Arch paper
 * uses to test visualisation, general awareness and colour sense.
 *
 * Every stem is suffix-tolerant for the same reason as above: the 2006 paper
 * says "architects", "colours", "coloured" and "buildings", none of which a
 * plain \b...\b would have matched.
 */
const APTITUDE_PATTERN = new RegExp(
  [
    /\b(?:architect|monument|temple|cathedral|mosque|tower|dome|facade|building|museum|colou?r|pigment|texture|timber|cement|concrete|mortar|plaster|marble|granite|brick|masonry|roof|stair|ventilat|landscap|urban|interior|furniture|sculpt|painting|mural|elevation|isometric|perspective)\w*/i.source,
    /\b(?:answer figures?|problem figures?|three dimensional|top view|side view|front view|designed by|built in|situated at|capital of|town planning|city|cities)\b/i.source,
    // "3-D", "3D", "3 D".
    /\b3-?\s?d\b/i.source,
  ].join('|'),
  'i',
);

/** Does this question read like maths, aptitude, or neither? */
function contentSignal(q: QBSectionInferenceInput): -1 | 0 | 1 {
  const text = [q.question_text ?? '', ...(q.options ?? []).map((o) => o?.text ?? '')]
    .join(' ')
    .trim();
  if (!text) return 0;

  // Aptitude is checked first and wins ties. Maths vocabulary leaks into
  // aptitude questions ("the tangent of the arch"), but architecture
  // vocabulary essentially never leaks into a maths question.
  const aptitude = APTITUDE_PATTERN.test(text);
  if (aptitude) return -1;

  // LaTeX is the strongest single signal we have: the aptitude half of these
  // papers is verbal and pictorial and carries no formulas at all.
  if (/\$[^$]*[\\^_{}=+\-/][^$]*\$/.test(text)) return 1;
  if (MATH_PATTERN.test(text)) return 1;

  return 0;
}

/**
 * Where the maths block ends and the aptitude block begins.
 *
 * A single-changepoint scan rather than per-question labelling, because these
 * papers are laid out as contiguous blocks and a block is far easier to get
 * right than 90 independent decisions. It also survives individual questions
 * that carry no signal: 2006's Q35 ("A set B contains 2007 elements...") has
 * no LaTeX and no keyword, but it sits inside a run of obvious maths, so the
 * boundary lands after it anyway.
 *
 * Returns the count of leading questions that are maths, or null when the
 * evidence is too thin to call.
 */
function findMathBoundary(signals: Array<-1 | 0 | 1>): number | null {
  const total = signals.length;
  if (total === 0) return null;

  const evidence = signals.filter((s) => s !== 0).length;
  // Fewer than a third of the questions saying anything is not a paper we
  // understand. Leave it to the teacher rather than split it on noise.
  if (evidence < Math.max(4, Math.ceil(total / 3))) return null;

  let best = 0;
  let bestScore = -Infinity;
  let running = 0;

  // score(b) = (maths-ness of everything before b) - (maths-ness of everything
  // from b on). Walk b from 0 to total, keeping the prefix sum.
  const totalSum = signals.reduce<number>((a, s) => a + s, 0);
  for (let b = 0; b <= total; b++) {
    if (b > 0) running += signals[b - 1];
    const score = running - (totalSum - running);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }

  // A boundary that claims the whole paper is one section is only believable
  // if the signal actually says so consistently.
  if (bestScore <= 0) return null;
  return best;
}

/**
 * Infer a section for every question of a paper.
 *
 * Questions are handled in paper order. Anything whose format already decides
 * the answer is settled first and removed from the scan, so a trailing pair of
 * drawing prompts cannot drag the maths/aptitude boundary around.
 */
export function inferPaperSections(
  questions: QBSectionInferenceInput[],
): QBSectionInferenceResult[] {
  const ordered = [...questions].sort((a, b) => {
    const an = a.question_number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.question_number ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });

  const result = new Map<string, QBQuestionSection | null>();
  const undecided: QBSectionInferenceInput[] = [];

  for (const q of ordered) {
    if (q.question_format === 'DRAWING_PROMPT') {
      result.set(q.id, 'drawing');
      continue;
    }
    if (q.question_format === 'NUMERICAL') {
      result.set(q.id, 'math_numerical');
      continue;
    }
    // MCQ and IMAGE_BASED are the only formats that can be either maths or
    // aptitude, and are the only ones the content scan gets a say over.
    undecided.push(q);
  }

  const signals = undecided.map(contentSignal);
  const boundary = findMathBoundary(signals);

  undecided.forEach((q, i) => {
    if (boundary == null) {
      result.set(q.id, null);
      return;
    }
    result.set(q.id, i < boundary ? 'math_mcq' : 'aptitude');
  });

  return ordered.map((q) => ({ id: q.id, section: result.get(q.id) ?? null }));
}
