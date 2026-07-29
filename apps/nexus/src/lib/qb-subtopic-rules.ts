/**
 * Deterministic coordinate-geometry sub-topic classifier.
 *
 * Every conic question in the bank sits on a single `conic_sections` slug, and
 * Locus and Areas of Triangles do not exist at all. This splits them by reading
 * the question text, so the expensive AI pass only has to handle the residue.
 *
 * Measured against the 20 active `conic_sections` questions in production, the
 * keyword layer alone resolves 18. The two it cannot name in words
 * ("A common tangent to x^2 - 2y^2 = 18 ...", "The latus rectum of the conic
 * section 9x^2 + 4y^2 - 36 = 0") are caught by the equation-shape detectors
 * below. That is ~100% at zero API cost and zero 429 risk against the shared
 * Gemini key.
 *
 * It returns a SET, not one label: "The locus of the mid points of the chords of
 * the parabola x^2 = 4py" is genuinely both `locus` and `parabola`, and
 * "If the foci of the ellipse ... and the hyperbola ... coincide" is both.
 *
 * Scope note: this assumes the caller has already narrowed to questions tagged
 * conic_sections / straight_lines / circles. Handed a 3D-geometry or
 * complex-numbers question it can still fire (a plane also has a "locus"), which
 * is why the proposal script never widens its scope to bare `mathematics`.
 */

export interface SubtopicMatch {
  /** Slugs to add to categories[]. */
  add: string[];
  /** Slugs to remove, currently only ever `conic_sections`. */
  remove: string[];
  /** Which rules fired, for the review UI's rationale column. */
  hits: string[];
}

const CONIC_SUBTYPES = ['parabola', 'ellipse', 'hyperbola'];

/** Coefficient of x^2 / y^2 in a LaTeX-ish expression, or null if absent. */
function squaredTermCoefficients(text: string): { x: number | null; y: number | null; sign: '+' | '-' | null } {
  // Matches "9x^2", "4y^2", "x^2", "2y^{2}", "\frac{x^2}{16}"
  const xMatch = text.match(/(\d*)\s*x\s*\^\s*\{?2\}?/);
  const yMatch = text.match(/([+-])?\s*(\d*)\s*y\s*\^\s*\{?2\}?/);
  if (!xMatch || !yMatch) return { x: null, y: null, sign: null };

  const xCoef = xMatch[1] ? Number(xMatch[1]) : 1;
  const yCoef = yMatch[2] ? Number(yMatch[2]) : 1;
  const sign = yMatch[1] === '-' ? '-' : yMatch[1] === '+' ? '+' : null;
  return { x: xCoef, y: yCoef, sign };
}

/**
 * Conic identified purely from the equation shape.
 *
 * The subtlety is that `x^2 + y^2 = 9` is a CIRCLE, not an ellipse, so the plus
 * form only means ellipse when the coefficients differ. Without that guard,
 * "A common tangent to x^2 - 2y^2 = 18 and x^2 + y^2 = 9" would be mislabelled
 * as both hyperbola and ellipse.
 */
export function conicFromEquationShape(text: string): string[] {
  const out = new Set<string>();

  // LaTeX fraction form: \frac{x^2}{a^2} +/- \frac{y^2}{b^2} = 1
  if (/\\frac\s*\{[^}]*x\s*\^\s*\{?2\}?[^}]*\}/.test(text) && /\\frac\s*\{[^}]*y\s*\^\s*\{?2\}?[^}]*\}/.test(text)) {
    if (/x\s*\^\s*\{?2\}?[^=]*?\}\s*-\s*\\frac/.test(text)) out.add('hyperbola');
    else if (/x\s*\^\s*\{?2\}?[^=]*?\}\s*\+\s*\\frac/.test(text)) out.add('ellipse');
  }

  // Plain polynomial form: ax^2 +/- by^2 = c
  const { x, y, sign } = squaredTermCoefficients(text);
  if (x !== null && y !== null && sign) {
    if (sign === '-') out.add('hyperbola');
    // Equal coefficients with a plus is a circle, not an ellipse.
    else if (x !== y) out.add('ellipse');
  }

  // Parabola: exactly one squared variable, the other linear. y^2 = 4ax / x^2 = 4py.
  const hasXSquared = /x\s*\^\s*\{?2\}?/.test(text);
  const hasYSquared = /y\s*\^\s*\{?2\}?/.test(text);
  if (hasYSquared && !hasXSquared && /y\s*\^\s*\{?2\}?\s*=\s*[^=]*x/.test(text)) out.add('parabola');
  if (hasXSquared && !hasYSquared && /x\s*\^\s*\{?2\}?\s*=\s*[^=]*y/.test(text)) out.add('parabola');

  return [...out];
}

/**
 * Classify one question's text into coordinate-geometry sub-topics.
 *
 * Named conics win over shape: an author who wrote "the hyperbola" meant it.
 * Shape only fills in when no name is present.
 */
export function classifyCoordinateGeometry(text: string | null | undefined): SubtopicMatch {
  const src = text || '';
  if (!src.trim()) return { add: [], remove: [], hits: [] };

  const add = new Set<string>();
  const hits: string[] = [];

  // 1-3. Named conics.
  if (/\bparabola[es]?\b/i.test(src)) {
    add.add('parabola');
    hits.push('keyword:parabola');
  }
  if (/\bellipses?\b/i.test(src)) {
    add.add('ellipse');
    hits.push('keyword:ellipse');
  }
  if (/\bhyperbola[es]?\b/i.test(src) || /\bconjugate axis\b|\basymptot/i.test(src)) {
    add.add('hyperbola');
    hits.push('keyword:hyperbola');
  }

  // Shape detection, only where no conic was named. "latus rectum" is
  // deliberately NOT a signal on its own: it is shared across all three conics
  // ("The latus rectum of the conic section 9x^2 + 4y^2 - 36 = 0" is an ellipse).
  if (add.size === 0) {
    for (const slug of conicFromEquationShape(src)) {
      add.add(slug);
      hits.push(`shape:${slug}`);
    }
  }

  // 4. Locus.
  if (/\blocus\b|\bloci\b/i.test(src)) {
    add.add('locus');
    hits.push('keyword:locus');
  }

  // 5. Area of a triangle, but only in a coordinate setting. The conjunction is
  //    what stops it swallowing mensuration, heights-and-distances, and
  //    "Area of a triangle with vertices z, iz, z + iz" (a complex-number
  //    question that happens to say "vertices").
  if (/\barea\s+of\s+(?:the|a|this)?\s*(?:triangle|\\Delta)/i.test(src) && hasCoordinateSignal(src)) {
    add.add('areas_of_triangles');
    hits.push('keyword:areas_of_triangles');
  }

  // 6. A question that resolved to a specific conic no longer belongs in the
  //    catch-all bucket.
  const remove = [...add].some((s) => CONIC_SUBTYPES.includes(s)) ? ['conic_sections'] : [];

  return { add: [...add], remove, hits };
}

/**
 * Does this read like a coordinate-plane question?
 *
 * A 2-tuple such as (1, 1) or the word "line". A 3-tuple like (1, 5, 1) is
 * deliberately excluded: those are 3D-geometry and determinant questions.
 * Trigonometric and complex-number markers veto outright.
 */
function hasCoordinateSignal(text: string): boolean {
  if (/\\sin|\\cos|\\tan|\bcomplex number\b/i.test(text)) return false;
  const pair = /\(\s*-?[\w\\{}^]+\s*,\s*-?[\w\\{}^]+\s*\)/.test(text);
  const line = /\blines?\b/i.test(text);
  return pair || line;
}
