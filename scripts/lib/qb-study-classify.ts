/**
 * Pure parts of scripts/qb-classify-study.ts: the prompts, the output schemas,
 * validation, the CSV report and gold-set scoring. No I/O here, so it is unit
 * tested on its own (qb-study-classify.test.ts).
 */

export interface ChapterOption {
  slug: string;
  label: string;
  group: string; // parent label, e.g. "Calculus"
}

export interface NcertOption {
  ref: string; // 'c11.2.4'
  label: string; // 'Class 11 Ch 2 Relations and Functions, 2.4 Functions'
}

export interface FoundationOption {
  id: string;
  chapter: string; // 'Ch 6 Building Materials'
  title: string;
  description: string | null;
}

export interface ClassifyQuestion {
  id: string;
  question_text: string | null;
  options: { id: string; text?: string | null }[] | null;
  correct_answer: string | null;
  explanation_brief: string | null;
  explanation_detailed: string | null;
  categories: string[];
}

export interface MathResult {
  primary_slug: string;
  also_uses: string[];
  concepts: { name: string; why: string; ncert_ref: string }[];
  confidence: number;
  rationale: string;
}

export interface AptitudeResult {
  foundation_section_id: string; // an id, or 'none'
  concept_name: string;
  why: string;
  confidence: number;
  rationale: string;
}

export const BROAD = new Set(['mathematics', 'aptitude', 'drawing']);

// ── Prompts ────────────────────────────────────────────────────────────────

const WRITING_RULES = `Writing rules for every text you return: plain English a Class 12 student understands, no LaTeX, no em dashes and no double dashes (use commas, colons or parentheses instead).`;

/**
 * The static system prompt for maths. Built once per run and cached by the API,
 * so it holds the whole vocabulary and the NCERT catalog. Keep it deterministic:
 * any byte that changes between calls breaks the cache.
 */
export function buildMathSystemPrompt(chapters: ChapterOption[], ncert: NcertOption[]): string {
  const chapterLines = chapters.map((c) => `- ${c.slug}: ${c.label} (${c.group})`).join('\n');
  const ncertLines = ncert.map((n) => `- ${n.ref}: ${n.label}`).join('\n');
  return `You are an experienced JEE Main Paper 2 (B.Arch) mathematics teacher in India. You read one question from a question bank, with its answer and worked solution, and decide what a student must study to solve it.

PRIMARY CHAPTER
The one chapter a teacher would teach this question under, judged by the main idea being tested and the steps of the solution. Never decide by which symbols appear. For example:
- "Domain of sqrt(2x-3) + sin x + sqrt(x-1)" is functions: sin x is defined everywhere and plays no part in the answer.
- "d2y/dx2 for x = a cos^3 t, y = a sin^3 t" is differentiation (parametric derivatives), not trigonometry.
- The area enclosed between curves is area_under_curves, even though it is computed with definite integrals.
- A system of linear equations decided by a determinant is determinants.
- Angles of elevation or depression is heights_and_distances.
- Sine rule, cosine rule, or distances in a triangle given its angles is properties_of_triangles.
- Counting the solutions of a trigonometric equation in an interval is trigonometric_equations.
- Simplifying expressions like tan(2 arctan(1/2)) or sqrt((cos(arctan x))^2) is inverse_trigonometry.
- Evaluating or simplifying trigonometric ratios with identities is trigonometric_ratios.
- Maxima, minima, range of a function found with derivatives, rate of change, increasing or decreasing is applications_of_derivatives.
- Rolle's theorem or the mean value theorem is mean_value_theorems.

ALSO USES
Up to 2 other chapters the solution genuinely depends on, never the primary chapter again. Leave it empty when nothing else is needed. A chapter that is only mentioned in passing does not count.

CONCEPTS
2 to 4 specific concepts the student needs, in the order the solution uses them. For each:
- name: short and student facing, e.g. "Domain of a square root function".
- why: one sentence on how this concept is used in this question.
- ncert_ref: the most specific NCERT section below that teaches it. Use "none" when NCERT does not teach it (several JEE topics were removed from NCERT, for example trigonometric equations, properties of triangles, Rolle's theorem, mathematical logic).

CONFIDENCE
A number from 0 to 1 for how sure you are of the primary chapter. Go below 0.85 when two chapters are about equally central, or the question text looks garbled or incomplete.

RATIONALE
One sentence explaining the primary chapter.

${WRITING_RULES}

CHAPTERS (use these slugs exactly)
${chapterLines}

NCERT SECTIONS (use these refs exactly)
${ncertLines}`;
}

export function buildAptitudeSystemPrompt(sections: FoundationOption[]): string {
  const lines = sections
    .map((s) => `- ${s.id}: ${s.chapter} > ${s.title}${s.description ? `. ${s.description}` : ''}`)
    .join('\n');
  return `You are an architecture entrance exam (NATA and JEE Main Paper 2) aptitude teacher in India. Your students have a Foundation book, split into the sections listed below. For one question bank question, decide which single section teaches what the student needs to answer it.

Pick a section only when its description shows it actually covers the fact or idea the answer depends on. A section that is merely on a related subject is not enough. When no section covers it, answer "none". Most general knowledge questions about a specific building, architect or material are covered only if that building, architect or material (or its group) is in the section description.

Return:
- foundation_section_id: a section id from the list, or "none".
- concept_name: the fact or idea to learn, short and student facing, e.g. "English bond in brickwork".
- why: one sentence on how it answers the question.
- confidence: 0 to 1, how sure you are the section teaches it. Below 0.85 when the description only suggests it.
- rationale: one sentence.

${WRITING_RULES}

FOUNDATION SECTIONS
${lines}`;
}

/** The user turn: the question, its options, the answer and the solution. */
export function buildQuestionMessage(q: ClassifyQuestion): string {
  const opts = (q.options || [])
    .map((o) => `(${o.id}) ${o.text ?? ''}`.trim())
    .join('\n');
  const parts = [
    `QUESTION\n${(q.question_text || '').trim()}`,
    opts ? `OPTIONS\n${opts}` : '',
    q.correct_answer ? `ANSWER\n${q.correct_answer}` : '',
    q.explanation_brief ? `QUICK EXPLANATION\n${q.explanation_brief.trim()}` : '',
    q.explanation_detailed ? `WORKED SOLUTION\n${q.explanation_detailed.trim().slice(0, 4000)}` : '',
    `CURRENT TAGS (may be wrong)\n${q.categories.filter((c) => !BROAD.has(c)).join(', ') || 'none'}`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

/**
 * The reply format for a classifier that is not the API (no schema enforcement),
 * appended to the exported system prompt. Same fields as mathSchema.
 */
export function mathOutputInstructions(): string {
  return `REPLY FORMAT
For each question in the batch, one object in a single JSON array (and nothing else in the file):
{"question_id": "<the id given>", "primary_slug": "<a chapter slug>", "also_uses": ["<chapter slug>"], "concepts": [{"name": "...", "why": "...", "ncert_ref": "<an NCERT ref or none>"}], "confidence": 0.9, "rationale": "..."}
confidence is a number from 0 to 1. Use only slugs and refs from the lists above, exactly as written.`;
}

export function aptitudeOutputInstructions(): string {
  return `REPLY FORMAT
For each question in the batch, one object in a single JSON array (and nothing else in the file):
{"question_id": "<the id given>", "foundation_section_id": "<a section id or none>", "concept_name": "...", "why": "...", "confidence": 0.9, "rationale": "..."}
confidence is a number from 0 to 1. Use only section ids from the list above, exactly as written.`;
}

// ── Output schemas (structured outputs) ──────────────────────────────────────

export function mathSchema(slugs: string[], refs: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['primary_slug', 'also_uses', 'concepts', 'confidence', 'rationale'],
    properties: {
      primary_slug: { type: 'string', enum: slugs },
      also_uses: { type: 'array', items: { type: 'string', enum: slugs } },
      concepts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'why', 'ncert_ref'],
          properties: {
            name: { type: 'string' },
            why: { type: 'string' },
            ncert_ref: { type: 'string', enum: [...refs, 'none'] },
          },
        },
      },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
    },
  };
}

export function aptitudeSchema(sectionIds: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['foundation_section_id', 'concept_name', 'why', 'confidence', 'rationale'],
    properties: {
      foundation_section_id: { type: 'string', enum: [...sectionIds, 'none'] },
      concept_name: { type: 'string' },
      why: { type: 'string' },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
    },
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Strip the dashes the content rules forbid, in case the model slips. */
export function cleanText(s: string): string {
  return s.replace(/\s*(—|–|--)\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

/**
 * Structured outputs already enforce the enums. This trims the rest to the
 * rules the schema cannot express (counts, duplicates, ranges) and returns
 * null when the answer is unusable.
 */
export function validateMathResult(
  raw: unknown,
  slugs: Set<string>,
  refs: Set<string>,
): MathResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MathResult>;
  if (!r.primary_slug || !slugs.has(r.primary_slug)) return null;
  const also = [...new Set((r.also_uses || []).filter((s) => slugs.has(s) && s !== r.primary_slug))].slice(0, 2);
  const concepts = (r.concepts || [])
    .filter((c) => c && typeof c.name === 'string' && c.name.trim())
    .slice(0, 4)
    .map((c) => ({
      name: cleanText(c.name),
      why: cleanText(c.why || ''),
      ncert_ref: refs.has(c.ncert_ref) ? c.ncert_ref : 'none',
    }));
  const confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0));
  return {
    primary_slug: r.primary_slug,
    also_uses: also,
    concepts,
    confidence,
    rationale: cleanText(r.rationale || ''),
  };
}

export function validateAptitudeResult(raw: unknown, ids: Set<string>): AptitudeResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AptitudeResult>;
  const id = r.foundation_section_id === 'none' || (r.foundation_section_id && ids.has(r.foundation_section_id))
    ? r.foundation_section_id
    : null;
  if (!id) return null;
  return {
    foundation_section_id: id,
    concept_name: cleanText(r.concept_name || ''),
    why: cleanText(r.why || ''),
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
    rationale: cleanText(r.rationale || ''),
  };
}

/** The question's current chapter(s): every non-broad category. */
export function currentChapters(categories: string[]): string[] {
  return categories.filter((c) => !BROAD.has(c));
}

// ── Gold set ─────────────────────────────────────────────────────────────────

export interface GoldItem {
  question_id: string;
  /** Acceptable primary chapters; the first is the best answer. */
  accept: string[];
  note?: string;
}

export function scoreGold(
  gold: GoldItem[],
  predictions: Map<string, string | null>,
): { correct: number; total: number; accuracy: number; misses: { id: string; expected: string[]; got: string | null }[] } {
  let correct = 0;
  const misses: { id: string; expected: string[]; got: string | null }[] = [];
  for (const g of gold) {
    const got = predictions.get(g.question_id) ?? null;
    if (got && g.accept.includes(got)) correct += 1;
    else misses.push({ id: g.question_id, expected: g.accept, got });
  }
  const total = gold.length;
  return { correct, total, accuracy: total ? correct / total : 0, misses };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}
