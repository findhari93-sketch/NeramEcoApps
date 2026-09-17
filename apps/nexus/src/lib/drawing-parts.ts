import type {
  QBDrawingPart,
  QBDrawingParts,
  QBDrawingPartsMode,
} from '@neram/database';

/**
 * Parts of one drawing question.
 *
 * JEE Paper 2 prints several drawing tasks under one question number. 2014 Q81
 * is "1(a) ... [20 marks] 1(b) ... [20 marks]", both compulsory. 2014 Q82 and
 * every paper since 2019 put an OR inside one question: "Draw X OR draw Y",
 * attempt any one. The parts live in nexus_qb_questions.drawing_parts, so the
 * question keeps its number, its test row and its marks.
 *
 * The one rule every writer follows: question_text stays the whole printed
 * question, rebuilt from the parts by composeDrawingPartsText. Search, the
 * drawing mirrors, the AI brief and every screen that has never heard of parts
 * keep showing the full question. applyDrawingPartsToWrite is the single place
 * that rebuild happens, and both the PATCH route and the paper JSON import go
 * through it.
 *
 * PURE: no database, no React, so drawing-parts.test.ts covers it with the real
 * printed texts.
 */

export const MIN_DRAWING_PARTS = 2;
export const MAX_DRAWING_PARTS = 4;

const PART_IDS = ['a', 'b', 'c', 'd'] as const;

export const DRAWING_PARTS_MODES: QBDrawingPartsMode[] = ['all', 'any_one'];

/** 'a' and 'A' for position 0, and so on. */
export function partIdAt(index: number): string {
  return PART_IDS[index] ?? String.fromCharCode(97 + index);
}

export function partLabelAt(index: number): string {
  return partIdAt(index).toUpperCase();
}

// ---------------------------------------------------------------------------
// Reading and validating
// ---------------------------------------------------------------------------

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanMarks(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type NormalizeResult =
  | { ok: true; parts: QBDrawingParts }
  | { ok: false; error: string };

/**
 * Validate parts from anywhere (a request body, a JSON file, a stored row) and
 * put them in canonical shape.
 *
 * Ids and labels are reassigned by position. Nothing references a part id yet
 * (a student still uploads one photo per question), so removing part A simply
 * makes the old B the new A, which is what the teacher sees on screen.
 * Marks only mean something when every part is answered, so 'any_one' drops
 * them rather than storing numbers nothing reads.
 */
export function normalizeDrawingParts(input: unknown): NormalizeResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Parts must be an object with a mode and items.' };
  }
  const raw = input as Record<string, unknown>;
  const mode = raw.mode;
  if (mode !== 'all' && mode !== 'any_one') {
    return { ok: false, error: 'Parts mode must be "all" or "any_one".' };
  }
  if (!Array.isArray(raw.items)) {
    return { ok: false, error: 'Parts need an items list.' };
  }
  if (raw.items.length < MIN_DRAWING_PARTS || raw.items.length > MAX_DRAWING_PARTS) {
    return {
      ok: false,
      error: `A question can have ${MIN_DRAWING_PARTS} to ${MAX_DRAWING_PARTS} parts, not ${raw.items.length}.`,
    };
  }

  const items: QBDrawingPart[] = [];
  for (let i = 0; i < raw.items.length; i++) {
    const item = raw.items[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Part ${partLabelAt(i)} is not valid.` };
    }
    const r = item as Record<string, unknown>;
    const text = cleanText(r.text);
    if (!text) {
      return { ok: false, error: `Part ${partLabelAt(i)} has no text.` };
    }
    items.push({
      id: partIdAt(i),
      label: partLabelAt(i),
      text,
      text_hi: cleanText(r.text_hi),
      marks: mode === 'all' ? cleanMarks(r.marks) : null,
      solution_image_url: cleanText(r.solution_image_url),
      solution_video_url: cleanText(r.solution_video_url),
    });
  }

  return {
    ok: true,
    parts: {
      mode,
      stem: cleanText(raw.stem),
      stem_hi: cleanText(raw.stem_hi),
      items,
    },
  };
}

/** Lenient read for screens: valid parts, or null for anything else. */
export function readDrawingParts(value: unknown): QBDrawingParts | null {
  if (value === null || value === undefined) return null;
  const result = normalizeDrawingParts(value);
  return result.ok ? result.parts : null;
}

// ---------------------------------------------------------------------------
// Composing the full printed text
// ---------------------------------------------------------------------------

const OR_WORD = { en: 'OR', hi: 'अथवा' } as const;
const MARKS_WORD = { en: 'marks', hi: 'अंक' } as const;

/**
 * The whole question as one text, the shape question_text has always held.
 *
 * Hindi composes only when every part (and the stem, if there is one) has
 * Hindi. Returns null otherwise, and the caller leaves question_text_hi alone:
 * a half-Hindi rebuild would silently drop the parts nobody translated.
 */
export function composeDrawingPartsText(
  parts: QBDrawingParts,
  language: 'en' | 'hi' = 'en',
): string | null {
  const hi = language === 'hi';
  const stem = hi ? parts.stem_hi : parts.stem;
  if (hi) {
    if (parts.items.some((p) => !p.text_hi)) return null;
    if (parts.stem && !parts.stem_hi) return null;
  }

  const blocks = parts.items.map((p) => {
    const body = (hi ? p.text_hi : p.text) ?? '';
    const marks =
      parts.mode === 'all' && p.marks ? ` [${p.marks} ${MARKS_WORD[language]}]` : '';
    return `(${p.label}) ${body}${marks}`;
  });
  const joiner = parts.mode === 'any_one' ? `\n\n${OR_WORD[language]}\n\n` : '\n\n';
  const body = blocks.join(joiner);
  return stem ? `${stem}\n\n${body}` : body;
}

// ---------------------------------------------------------------------------
// The single writer
// ---------------------------------------------------------------------------

export type ApplyPartsResult = { ok: true } | { ok: false; error: string };

/**
 * Fold drawing_parts into a question write, in place.
 *
 * - No drawing_parts key: nothing to do.
 * - drawing_parts null: the question is one task again. question_text is
 *   whatever the caller sent (the editor sends the merged text).
 * - Parts: validated, then question_text rebuilt from them, question_text_hi
 *   rebuilt when every part has Hindi, drawing_marks set to the sum when every
 *   part in an 'all' question has marks, and the question's own solution image
 *   and video mirror the first part that has one, so a screen that reads only
 *   the question-level columns still shows a solution.
 *
 * `storedFormat` is the row's format today, used when the body does not say.
 */
export function applyDrawingPartsToWrite(
  body: Record<string, unknown>,
  storedFormat?: string | null,
): ApplyPartsResult {
  if (!('drawing_parts' in body)) return { ok: true };
  if (body.drawing_parts === null) return { ok: true };

  const format = (body.question_format as string | undefined) ?? storedFormat ?? null;
  if (format !== 'DRAWING_PROMPT') {
    return { ok: false, error: 'Only a drawing question can be split into parts.' };
  }

  const result = normalizeDrawingParts(body.drawing_parts);
  if (!result.ok) return result;
  const parts = result.parts;

  body.drawing_parts = parts;
  body.question_text = composeDrawingPartsText(parts, 'en');
  const hindi = composeDrawingPartsText(parts, 'hi');
  if (hindi) body.question_text_hi = hindi;

  if (parts.mode === 'all' && parts.items.every((p) => p.marks)) {
    body.drawing_marks = parts.items.reduce((sum, p) => sum + (p.marks ?? 0), 0);
  }

  body.solution_image_url = parts.items.find((p) => p.solution_image_url)?.solution_image_url ?? null;
  body.solution_video_url = parts.items.find((p) => p.solution_video_url)?.solution_video_url ?? null;

  return { ok: true };
}

/**
 * What a test is allowed to send. A test never shows a solution before the
 * student submits, so the per-part solution fields are dropped here rather
 * than trusted to the player to hide.
 */
export function stripPartSolutions(value: unknown): QBDrawingParts | null {
  const parts = readDrawingParts(value);
  if (!parts) return null;
  return {
    mode: parts.mode,
    stem: parts.stem ?? null,
    stem_hi: parts.stem_hi ?? null,
    items: parts.items.map((p) => ({
      id: p.id,
      label: p.label,
      text: p.text,
      text_hi: p.text_hi ?? null,
      marks: p.marks ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Words on screen
// ---------------------------------------------------------------------------

/** "Attempt any one of 2", "Answer both parts", "Answer all 3 parts". */
export function drawingPartsSummary(parts: QBDrawingParts): string {
  const n = parts.items.length;
  if (parts.mode === 'any_one') return `Attempt any one of ${n}`;
  return n === 2 ? 'Answer both parts' : `Answer all ${n} parts`;
}

/** The short form for a list row: "Any 1 of 2", "2 parts". */
export function drawingPartsChipLabel(parts: QBDrawingParts): string {
  const n = parts.items.length;
  return parts.mode === 'any_one' ? `Any 1 of ${n}` : `${n} parts`;
}

/** "81A", or just "A" when the number is not known. */
export function partNumberLabel(questionNumber: number | null | undefined, part: Pick<QBDrawingPart, 'label'>): string {
  return questionNumber != null ? `${questionNumber}${part.label}` : part.label;
}

/** Sum of part marks when every part has one, else null. */
export function totalPartMarks(parts: QBDrawingParts): number | null {
  if (parts.mode !== 'all') return null;
  if (!parts.items.every((p) => p.marks)) return null;
  return parts.items.reduce((sum, p) => sum + (p.marks ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Suggesting a split from the printed text
// ---------------------------------------------------------------------------

export interface DrawingPartsSuggestion {
  parts: QBDrawingParts;
  /**
   * Marks printed once for an either/or question ("30 Marks" after option A in
   * 2019). Belongs to the question, not to an option, so the editor offers it
   * as the question's marks.
   */
  questionMarks: number | null;
}

// A standalone uppercase OR. Lowercase "or" is ordinary English inside a
// sentence ("separate, overlapping or within each other"), so it never splits.
const EN_OR = /\s+OR\s+/;
// अथवा is only ever the paper's either/or. या is also everyday Hindi, so it
// counts only on a line of its own, which is how the paper prints it.
const HI_OR = /\s+(?:अथवा|OR)\s+|\s*\n\s*या\s*\n\s*/;

const ANY_ONE_STEM = /^([\s\S]*?\battempt\s+any\s+(?:one|1)\b[^:\n]*:)\s*/i;

// "(a) ", "1(a) ", "(A) ", "Q1 (b) " at the start of a piece.
const LEADING_LABEL = /^(?:Q?\d{1,2}\s*)?\(\s*[a-dA-D]\s*\)\s*/;

// "[20 marks]", "(30 Marks)", "30 Marks", "[20 अंक]" at the end of a piece.
const TRAILING_MARKS = /\s*[\[(]?\s*(\d{1,3})\s*(?:marks?|अंक)\s*[\])]?\s*[.।]?\s*$/i;

function takeMarks(piece: string): { text: string; marks: number | null } {
  const m = piece.match(TRAILING_MARKS);
  if (!m) return { text: piece.trim(), marks: null };
  return { text: piece.slice(0, m.index).trim(), marks: Number(m[1]) };
}

function stripLabel(piece: string): string {
  return piece.replace(LEADING_LABEL, '').trim();
}

/** Positions of a (a), (b), (c), (d) run, each at a word boundary, in order. */
function findLetterMarkers(text: string): number[] {
  const starts: number[] = [];
  let from = 0;
  for (const letter of PART_IDS) {
    const re = new RegExp(`(^|\\s)((?:Q?\\d{1,2}\\s*)?\\(\\s*[${letter}${letter.toUpperCase()}]\\s*\\))(?=\\s)`);
    const m = re.exec(text.slice(from));
    if (!m) break;
    const at = from + m.index + m[1].length;
    starts.push(at);
    from = at + m[2].length;
  }
  return starts;
}

function splitAt(text: string, starts: number[]): { stem: string; pieces: string[] } {
  const stem = text.slice(0, starts[0]).trim();
  const pieces = starts.map((s, i) => text.slice(s, starts[i + 1] ?? text.length).trim());
  return { stem, pieces };
}

/**
 * Read the printed text and propose parts, or null when it is one task.
 *
 * An OR wins over letter markers: 2021 Q2 is "Draw a kite festival OR draw a
 * composition with (i) cuboid A and (ii) cuboid B", and the (i)/(ii) belong to
 * the second option. Letters are only a to d, so roman numerals never split.
 * Nothing here is saved; the teacher sees the preview and presses Split.
 */
export function suggestDrawingParts(
  text: string | null | undefined,
  textHi?: string | null,
): DrawingPartsSuggestion | null {
  const source = (text ?? '').trim();
  if (!source) return null;

  let mode: QBDrawingPartsMode;
  let stem = '';
  let pieces: string[];

  const stemMatch = source.match(ANY_ONE_STEM);
  const afterStem = stemMatch ? source.slice(stemMatch[0].length) : source;
  const orPieces = afterStem.split(EN_OR).map((p) => p.trim()).filter(Boolean);

  if (orPieces.length >= MIN_DRAWING_PARTS) {
    mode = 'any_one';
    stem = stemMatch ? stemMatch[1].trim() : '';
    pieces = orPieces;
  } else {
    const starts = findLetterMarkers(source);
    if (starts.length < MIN_DRAWING_PARTS) return null;
    mode = 'all';
    const split = splitAt(source, starts);
    stem = split.stem;
    pieces = split.pieces;
  }
  if (pieces.length > MAX_DRAWING_PARTS) return null;

  let questionMarks: number | null = null;
  const items: QBDrawingPart[] = pieces.map((piece, i) => {
    const { text: body, marks } = takeMarks(stripLabel(piece));
    if (mode === 'any_one' && marks != null && questionMarks == null) questionMarks = marks;
    return {
      id: partIdAt(i),
      label: partLabelAt(i),
      text: body,
      text_hi: null,
      marks: mode === 'all' ? marks : null,
      solution_image_url: null,
      solution_video_url: null,
    };
  });
  if (items.some((p) => !p.text)) return null;

  const parts: QBDrawingParts = { mode, stem: stem || null, stem_hi: null, items };
  fillHindi(parts, textHi);
  return { parts, questionMarks };
}

/**
 * Best effort. Hindi is attached only when it splits into exactly as many
 * pieces as the English did; anything less certain is left for the teacher,
 * because a Hindi option under the wrong English one is worse than a blank.
 */
function fillHindi(parts: QBDrawingParts, textHi: string | null | undefined): void {
  const source = (textHi ?? '').trim();
  if (!source) return;
  const n = parts.items.length;

  let stemHi = '';
  let pieces: string[];
  if (parts.mode === 'any_one') {
    pieces = source.split(HI_OR).map((p) => p.trim()).filter(Boolean);
    if (pieces.length !== n) return;
    if (parts.stem) {
      // The English stem ends in a colon; the Hindi one is printed the same way.
      const colon = pieces[0].indexOf(':');
      if (colon < 0) return;
      stemHi = pieces[0].slice(0, colon + 1).trim();
      pieces[0] = pieces[0].slice(colon + 1).trim();
    }
  } else {
    const starts = findLetterMarkers(source);
    if (starts.length !== n) return;
    const split = splitAt(source, starts);
    stemHi = split.stem;
    pieces = split.pieces;
    if (Boolean(parts.stem) !== Boolean(stemHi)) return;
  }

  const bodies = pieces.map((p) => takeMarks(stripLabel(p)).text);
  if (bodies.some((b) => !b)) return;
  parts.items.forEach((item, i) => {
    item.text_hi = bodies[i];
  });
  parts.stem_hi = stemHi || null;
}
