/**
 * Class draft: a copy-paste bridge to an outside AI (ChatGPT / Gemini / Claude).
 * The teacher describes a class in one line, runs the prompt, and pastes back the
 * JSON, which fills the class Title and Description in the Add Class dialog. Content
 * only: no server-side AI, no cost. Mirrors the pattern in topic-quick-add.ts.
 */

export interface ClassDraftJSON {
  title?: string;
  description?: string;
}

export interface ClassDraftData {
  title: string;
  description: string;
}

export interface ClassDraftResult {
  valid: boolean;
  errors: string[];
  data: ClassDraftData | null;
}

export const CLASS_DRAFT_SCHEMA_EXAMPLE: ClassDraftJSON = {
  title: 'Isometric Drawing: Building 3D Forms from Plans',
  description:
    'A hands-on session on reading orthographic views and constructing accurate isometric drawings.\n\n- Warm-up: quick review of the isometric axes\n- Main: step-by-step build of a stepped block and an L-shape\n- Practice: 3 forms from given top and front views',
};

/** Build the interview prompt, optionally seeded with the teacher's one-line idea. */
export function buildClassDraftPrompt(idea?: string): string {
  const seed = (idea || '').trim();
  return `You are helping a teacher write ONE class for an architecture-entrance coaching class (NATA / JEE B.Arch).

${seed ? `The teacher's class idea: "${seed}"\n\n` : ''}Write a clear, student-facing class Title and Description.

Rules:
- "title" is a short, specific class name (5 to 10 words). No date or time in it.
- "description" is plain text: 2 to 4 sentences OR a few "- " bullet lines describing what the class covers and what students will do. Keep it practical.
- Do NOT use em dashes. Use commas, colons, periods or parentheses instead.
- Output ONLY a JSON object (no commentary before or after) matching this exact shape:

\`\`\`json
${JSON.stringify(CLASS_DRAFT_SCHEMA_EXAMPLE, null, 2)}
\`\`\`
${seed ? '' : '\nIf the class idea is not clear, ask me ONE short question first, then output the JSON after I answer.\n'}`;
}

/** Backwards-friendly constant for callers that want the bare prompt. */
export const CLASS_DRAFT_PROMPT = buildClassDraftPrompt();

export function validateClassDraft(input: unknown): ClassDraftResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Paste a single JSON object (it starts with { and ends with }).'], data: null };
  }
  const j = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const title = str(j.title);
  const description = str(j.description);

  if (!title && !description) {
    errors.push('Nothing to fill. The JSON had no "title" or "description".');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length ? null : { title, description },
  };
}

/** Tolerant parse: accepts raw JSON, a fenced ```json block, or JSON with prose around it. */
export function parseClassDraft(text: string): ClassDraftResult {
  const trimmed = (text || '').trim();
  if (!trimmed) return { valid: false, errors: ['Paste the JSON the AI gave you.'], data: null };
  let jsonText = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    jsonText = fence[1].trim();
  } else {
    const first = jsonText.indexOf('{');
    const last = jsonText.lastIndexOf('}');
    if (first > 0 && last > first) jsonText = jsonText.slice(first, last + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      valid: false,
      errors: ['That is not valid JSON. Copy the whole JSON block the AI produced.'],
      data: null,
    };
  }
  return validateClassDraft(parsed);
}
