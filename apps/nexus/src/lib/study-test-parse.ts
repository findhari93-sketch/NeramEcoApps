import type { NexusStudyTestQuestionInput } from '@neram/database/types';

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

/** Copy-paste prompt teachers give an AI tool (with the PDF) to generate the test JSON. */
export const STUDY_TEST_AI_PROMPT = `You are creating a multiple-choice test for a study-material chapter (PDF attached).
Write 8-12 questions that check whether a student has actually studied and understood the chapter.
Return ONLY valid JSON in exactly this shape (no prose, no markdown fences):

{
  "title": "Chapter test",
  "passing_pct": 70,
  "questions": [
    {
      "question": "Question text here?",
      "options": { "a": "Option A", "b": "Option B", "c": "Option C", "d": "Option D" },
      "answer": "b",
      "explanation": "Why B is correct (optional)."
    }
  ]
}

Rules: each question needs at least options a and b; "answer" must be one of "a","b","c","d";
keep questions factual and unambiguous; base every question on the attached chapter only.`;

/** The example JSON, shown in the dialog. */
export const STUDY_TEST_JSON_EXAMPLE = `{
  "title": "Architecture around the World - Chapter 4",
  "passing_pct": 70,
  "questions": [
    {
      "question": "Which material is most associated with Islamic architecture?",
      "options": { "a": "Timber", "b": "Glazed tile", "c": "Concrete", "d": "Steel" },
      "answer": "b",
      "explanation": "Glazed tilework is a hallmark of Islamic architecture."
    }
  ]
}`;

function extractOptions(q: any): string[] {
  if (Array.isArray(q?.options)) return q.options.map((o: any) => String(o ?? '').trim());
  if (q?.options && typeof q.options === 'object') {
    return OPTION_KEYS.map((k) => q.options[k]).filter((v: any) => v != null).map((v: any) => String(v).trim());
  }
  return OPTION_KEYS.map((k) => q?.[`option_${k}`]).filter((v: any) => v != null).map((v: any) => String(v).trim());
}

function letterFromAnswer(ans: any, options: string[]): 'a' | 'b' | 'c' | 'd' | null {
  if (ans == null) return null;
  if (typeof ans === 'number') return OPTION_KEYS[ans] ?? OPTION_KEYS[ans - 1] ?? null;
  const s = String(ans).trim().toLowerCase();
  if ((OPTION_KEYS as readonly string[]).includes(s)) return s as any;
  if (['1', '2', '3', '4'].includes(s)) return OPTION_KEYS[Number(s) - 1];
  const idx = options.findIndex((o) => o.trim().toLowerCase() === s);
  return idx >= 0 ? OPTION_KEYS[idx] : null;
}

export interface ParsedStudyTest {
  title: string | null;
  passingPct: number | null;
  questions: NexusStudyTestQuestionInput[];
  warnings: string[];
}

/**
 * Tolerantly parse AI-generated (or hand-written) test JSON into validated question inputs.
 * Accepts options as {a,b,c,d}, an array, or option_a..d; answer as a letter, 1-based index, or the
 * option's text. Skips malformed questions (reported in `warnings`). Throws on non-JSON / no array.
 */
export function parseStudyTestJson(raw: string): ParsedStudyTest {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('That is not valid JSON. Paste the JSON exactly as the AI produced it.');
  }
  const arr = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(arr)) throw new Error('JSON must have a "questions" array.');

  const warnings: string[] = [];
  const questions: NexusStudyTestQuestionInput[] = [];
  arr.forEach((q: any, i: number) => {
    const text = String(q?.question ?? q?.question_text ?? q?.q ?? '').trim();
    const opts = extractOptions(q);
    const correct = letterFromAnswer(q?.answer ?? q?.correct ?? q?.correct_option, opts);
    if (!text || opts.length < 2 || !correct) {
      warnings.push(`Question ${i + 1} skipped (needs text, 2+ options, and a valid answer).`);
      return;
    }
    const optIndex = OPTION_KEYS.indexOf(correct);
    if (optIndex >= opts.length || !opts[optIndex]) {
      warnings.push(`Question ${i + 1} skipped (answer points to a missing option).`);
      return;
    }
    questions.push({
      question_text: text,
      option_a: opts[0],
      option_b: opts[1],
      option_c: opts[2] || null,
      option_d: opts[3] || null,
      correct_option: correct,
      explanation: q?.explanation ? String(q.explanation).trim() : null,
    });
  });

  const pct = Number(data?.passing_pct ?? data?.passingPct);
  return {
    title: typeof data?.title === 'string' ? data.title.trim() || null : null,
    passingPct: Number.isFinite(pct) ? pct : null,
    questions,
    warnings,
  };
}
