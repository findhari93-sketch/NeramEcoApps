/**
 * External-AI bulk tagging contract (Question Bank tagging assistant).
 *
 * The teacher copies a generated prompt (registry + a chunk of questions) into
 * ChatGPT / Gemini / Claude, then pastes the AI's JSON answer back. This module
 * builds that prompt and validates the pasted result. Framework-free on purpose,
 * mirroring assignment-bulk-schema.ts: it runs in the dialog for instant feedback
 * and the same normalization applies before commit.
 */

export interface TaggingRegistryTag {
  id: string;
  slug: string;
  label: string;
  group_type: 'exam' | 'subject' | 'theme';
}

export interface TaggingExportQuestion {
  id: string;
  question_text: string | null;
  options?: unknown;
}

export interface TaggingPair {
  question_id: string;
  tag_ids: string[];
  tag_slugs: string[];
}

export interface TaggingValidationResult {
  pairs: TaggingPair[];
  /** Row-level problems that dropped a row entirely. */
  errors: string[];
  /** Recoverable issues (unknown slugs dropped, duplicates merged). */
  warnings: string[];
}

const MAX_TEXT_CHARS = 400;
const MAX_TAGS_PER_QUESTION = 5;

function optionsToText(options: unknown): string {
  if (!Array.isArray(options)) return '';
  const parts: string[] = [];
  for (const o of options as Array<Record<string, unknown>>) {
    const text = typeof o?.text === 'string' ? o.text : typeof o?.label === 'string' ? o.label : '';
    if (text) parts.push(text);
  }
  return parts.join(' | ').slice(0, 200);
}

/** The full copy-paste prompt for one chunk of questions. */
export function buildTaggingPrompt(questions: TaggingExportQuestion[], registry: TaggingRegistryTag[]): string {
  const byGroup: Record<string, TaggingRegistryTag[]> = { exam: [], subject: [], theme: [] };
  for (const t of registry) {
    (byGroup[t.group_type] || (byGroup[t.group_type] = [])).push(t);
  }
  const tagLines = (['exam', 'subject', 'theme'] as const)
    .filter((g) => (byGroup[g] || []).length > 0)
    .map((g) => `${g.toUpperCase()}: ${(byGroup[g] || []).map((t) => `${t.slug} (${t.label})`).join(', ')}`)
    .join('\n');

  const questionLines = questions.map((q) => {
    const text = (q.question_text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
    const opts = optionsToText(q.options);
    return JSON.stringify({ id: q.id, text: text || '(image-based question)', ...(opts ? { options: opts } : {}) });
  });

  return [
    'You are tagging architecture entrance-exam questions (NATA / JEE Paper 2) for a question bank.',
    '',
    'ALLOWED TAGS (use slug values ONLY, never invent a new slug):',
    tagLines,
    '',
    `For EACH question below pick the most fitting tags (1 to ${MAX_TAGS_PER_QUESTION}, fewer is better than wrong).`,
    'Prefer one subject tag plus any clearly matching theme tag. Only add an exam tag when the question is exam-specific.',
    '',
    'QUESTIONS (JSON, one per line):',
    ...questionLines,
    '',
    'Reply with ONLY this JSON, no commentary, no markdown fences:',
    '{"assignments":[{"question_id":"<id from the input>","tag_slugs":["slug1","slug2"]}]}',
    'Include every question exactly once, in the same order.',
  ].join('\n');
}

/** Strip markdown fences and grab the outermost JSON object/array from an AI reply. */
function extractJSON(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  if (text.startsWith('{') || text.startsWith('[')) return text;
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start === -1) return text;
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

/**
 * Validate a pasted AI reply. Accepts {"assignments":[...]} or a bare array.
 * Unknown question ids (when knownIds provided) and unknown slugs are dropped
 * with messages; rows without any valid slug are skipped. The server re-checks
 * question ids at commit, so unknown ids without a knownIds set pass through.
 */
export function validateTaggingJSON(
  raw: string,
  registry: TaggingRegistryTag[],
  knownIds?: Set<string>,
): TaggingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSON(raw));
  } catch {
    return { pairs: [], errors: ['Could not parse JSON. Paste the AI reply exactly, without extra commentary.'], warnings };
  }

  let rows: unknown[];
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).assignments)) {
    rows = (parsed as { assignments: unknown[] }).assignments;
  } else {
    return { pairs: [], errors: ['Expected {"assignments":[...]} or a bare array of rows.'], warnings };
  }

  const slugToTag = new Map<string, TaggingRegistryTag>();
  for (const t of registry) slugToTag.set(t.slug.toLowerCase(), t);

  const seen = new Set<string>();
  const pairs: TaggingPair[] = [];

  rows.forEach((row, index) => {
    const r = row as Record<string, unknown>;
    const qid = typeof r?.question_id === 'string' ? r.question_id.trim() : '';
    if (!qid || qid.length < 10) {
      errors.push(`Row ${index + 1}: missing or invalid question_id, row skipped.`);
      return;
    }
    if (knownIds && knownIds.size > 0 && !knownIds.has(qid)) {
      errors.push(`Row ${index + 1}: question_id ${qid.slice(0, 8)}... is not in the exported chunk, row skipped.`);
      return;
    }
    if (seen.has(qid)) {
      warnings.push(`Row ${index + 1}: duplicate question_id ${qid.slice(0, 8)}..., merged into the first row.`);
      const existing = pairs.find((p) => p.question_id === qid);
      const rawSlugs = Array.isArray(r?.tag_slugs) ? (r.tag_slugs as unknown[]) : [];
      for (const s of rawSlugs) {
        const tag = typeof s === 'string' ? slugToTag.get(s.trim().toLowerCase()) : undefined;
        if (tag && existing && !existing.tag_ids.includes(tag.id)) {
          existing.tag_ids.push(tag.id);
          existing.tag_slugs.push(tag.slug);
        }
      }
      return;
    }

    const rawSlugs = Array.isArray(r?.tag_slugs) ? (r.tag_slugs as unknown[]) : [];
    const tagIds: string[] = [];
    const tagSlugs: string[] = [];
    for (const s of rawSlugs) {
      if (typeof s !== 'string') continue;
      const tag = slugToTag.get(s.trim().toLowerCase());
      if (!tag) {
        warnings.push(`Row ${index + 1}: unknown slug "${s}" dropped.`);
        continue;
      }
      if (!tagIds.includes(tag.id)) {
        tagIds.push(tag.id);
        tagSlugs.push(tag.slug);
      }
    }
    if (tagIds.length === 0) {
      warnings.push(`Row ${index + 1}: no valid tags, row skipped.`);
      return;
    }
    seen.add(qid);
    pairs.push({ question_id: qid, tag_ids: tagIds.slice(0, MAX_TAGS_PER_QUESTION), tag_slugs: tagSlugs.slice(0, MAX_TAGS_PER_QUESTION) });
  });

  return { pairs, errors, warnings };
}
