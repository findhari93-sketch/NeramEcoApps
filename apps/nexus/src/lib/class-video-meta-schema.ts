/**
 * Class video metadata: a copy-paste bridge to an outside AI (ChatGPT / Gemini
 * / Claude).
 *
 * The teacher taps Copy once. The prompt already carries the class facts, the
 * Teams transcript and the list of tags they are allowed to choose from. They
 * run it in any chatbot and paste the JSON back. Content only: no server-side
 * AI, no cost, and no dependency on the one shared GEMINI_API_KEY that every
 * other AI feature in the app competes for.
 *
 * The allowed-tag list is the important part. Letting the model invent topic
 * strings is how you end up with "one point perspective", "1 point perspective"
 * and "perspective (1pt)" as three unrelated topics that no single search can
 * find. Constraining it to the canonical nexus_qb_tags registry is what makes
 * a student's tap on a topic reliably return every class about it.
 */

import { extractJsonObject } from './json-parser';
import {
  buildYouTubeTags,
  hasBannedDashes,
  stripBannedDashes,
  tagsCharCount,
  validateChapters,
  YT_DESCRIPTION_MAX,
  YT_TAGS_MAX_CHARS,
  YT_TITLE_MAX,
} from './youtube-metadata';
import type {
  ClassVideoChapter,
  LibraryCategory,
  LibraryVideoDifficulty,
  LibraryVideoExam,
  LibraryVideoLanguage,
} from '@neram/database/types';

const LANGUAGES: LibraryVideoLanguage[] = ['ta', 'en', 'ta_en'];
const EXAMS: LibraryVideoExam[] = ['nata', 'jee_barch', 'both', 'general'];
const DIFFICULTIES: LibraryVideoDifficulty[] = ['beginner', 'intermediate', 'advanced', 'mixed'];
const CATEGORIES: LibraryCategory[] = [
  'drawing', 'aptitude', 'mathematics', 'general_knowledge', 'exam_preparation', 'orientation',
];

/** Roughly 12k tokens. Comfortably inside any chatbot's paste limit. */
export const MAX_PROMPT_TRANSCRIPT_CHARS = 48000;

/** A tag the model is allowed to pick, as shown in the prompt. */
export interface AllowedTag {
  slug: string;
  label: string;
  group_type: string;
  aliases?: string[] | null;
}

/** What the AI is asked to produce. */
export interface ClassVideoMetaJSON {
  topic_phrase?: string;
  hook?: string;
  bullets?: string[];
  chapters?: { t?: number; time?: string; label?: string }[];
  tag_slugs?: string[];
  search_terms?: string[];
  category?: string;
  exam?: string;
  language?: string;
  difficulty?: string;
}

export interface ClassVideoMetaData {
  topicPhrase: string;
  hook: string;
  bullets: string[];
  chapters: ClassVideoChapter[];
  tagSlugs: string[];
  searchTerms: string[];
  category: LibraryCategory | null;
  exam: LibraryVideoExam | null;
  language: LibraryVideoLanguage | null;
  difficulty: LibraryVideoDifficulty | null;
}

export interface ClassVideoMetaResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: ClassVideoMetaData | null;
}

export const CLASS_VIDEO_META_EXAMPLE: ClassVideoMetaJSON = {
  topic_phrase: 'One Point Perspective: Boxes and Eye Level',
  hook: 'Learn how to set an eye level and build boxes in one point perspective, step by step.',
  bullets: [
    'Setting the horizon line and a single vanishing point',
    'Constructing cubes above and below eye level',
    'Common mistakes with converging edges',
  ],
  chapters: [
    { time: '0:00', label: 'Introduction' },
    { time: '2:14', label: 'Horizon line and vanishing point' },
    { time: '11:40', label: 'Building the first box' },
  ],
  tag_slugs: ['drawing', 'perspective'],
  search_terms: ['one point perspective', 'vanishing point', 'eye level', 'horizon line'],
  category: 'drawing',
  exam: 'both',
  language: 'ta_en',
  difficulty: 'beginner',
};

export interface PromptClass {
  title?: string | null;
  description?: string | null;
  scheduled_date?: string | null;
  summary_bullets?: unknown;
}

export interface BuildPromptInput {
  cls: PromptClass;
  tutorName?: string | null;
  transcript?: string | null;
  /** Reason the transcript is missing, shown to the AI so it does not invent one. */
  transcriptNote?: string | null;
  tags: AllowedTag[];
  /** Slugs already on the class, so the AI keeps what the teacher chose. */
  currentTagSlugs?: string[];
}

function bulletsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((b) => String(b ?? '').trim()).filter(Boolean);
}

/**
 * Assemble the one block the teacher copies.
 *
 * Everything the model needs is inlined, including the transcript, so the
 * teacher pastes once instead of gathering context themselves.
 */
export function buildVideoMetaPrompt(input: BuildPromptInput): string {
  const { cls, tutorName, transcript, transcriptNote, tags, currentTagSlugs } = input;

  const tagLines = tags
    .filter((t) => t.group_type !== 'exam')
    .map((t) => {
      const aliases = (t.aliases || []).filter(Boolean);
      const alias = aliases.length ? `  (also called: ${aliases.join(', ')})` : '';
      return `- ${t.slug}: ${t.label}${alias}`;
    })
    .join('\n');

  const classBullets = bulletsFrom(cls.summary_bullets);
  const facts = [
    cls.title ? `Class title: ${cls.title}` : null,
    cls.description ? `Class brief: ${cls.description}` : null,
    cls.scheduled_date ? `Class date: ${cls.scheduled_date}` : null,
    tutorName ? `Tutor: ${tutorName}` : null,
    currentTagSlugs?.length ? `Tags the teacher already picked: ${currentTagSlugs.join(', ')}` : null,
    classBullets.length ? `What the teacher noted:\n${classBullets.map((b) => `- ${b}`).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const transcriptBlock = transcript?.trim()
    ? `Transcript of the class (timestamps are [mm:ss]):\n"""\n${transcript.trim().slice(0, MAX_PROMPT_TRANSCRIPT_CHARS)}\n"""`
    : `There is no transcript for this class. ${transcriptNote || 'Work from the class facts above.'} Do not invent chapters: return an empty "chapters" array.`;

  return `You are writing the YouTube listing for a recorded class from Neram Classes, an architecture entrance coaching institute in India preparing students for NATA and JEE B.Arch Paper 2.

The video is uploaded unlisted. Students find it inside our own app by searching, so the words you choose are what makes the class findable.

${facts}

${transcriptBlock}

Pick topic tags ONLY from this list. Use the slug on the left, never invent a new one. If a class covers something not listed, choose the closest listed tag and put the specific wording in "search_terms" instead.

${tagLines}

Rules:
- "topic_phrase": what the class actually teaches, in the words a student would type. 4 to 9 words. No date, no class number, no "Day 12".
- "hook": ONE sentence, under 150 characters, saying what a student will be able to do after watching. This is the line YouTube shows in search results.
- "bullets": 3 to 6 short points on what the class covered.
- "chapters": the real sections of the class with their timestamps, taken from the transcript. The first one MUST be "0:00". At least 3, or an empty array if you cannot tell. Keep them at least 10 seconds apart. Use "m:ss" or "h:mm:ss".
- "tag_slugs": 2 to 5 slugs from the list above.
- "search_terms": 5 to 12 phrases a student might actually type to find this class, including the loose and misspelled ways people say things. This is the most useful field you produce.
- "category": one of ${CATEGORIES.join(', ')}.
- "exam": one of ${EXAMS.join(', ')}. Use "both" when it helps NATA and JEE equally.
- "language": one of ${LANGUAGES.join(', ')}, based on what is actually spoken in the transcript. Most classes are "ta_en".
- "difficulty": one of ${DIFFICULTIES.join(', ')}.
- Write in clear, simple English even though the class is spoken in a mix of Tamil and English.
- Ignore meeting boilerplate: joining sounds, roll call, "can you hear me", links pasted in chat.
- Never use an em dash, a double dash, or the &mdash; entity. Use commas, colons, periods or parentheses.

Output ONLY a JSON object, no commentary before or after, matching this exact shape:

\`\`\`json
${JSON.stringify(CLASS_VIDEO_META_EXAMPLE, null, 2)}
\`\`\``;
}

/** "2:14" or "1:01:30" or a raw second count to seconds. Returns null if unusable. */
export function parseChapterTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p.trim()))) return null;
  const nums = parts.map((p) => Number(p.trim()));
  const seconds = parts.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
  return Number.isFinite(seconds) ? seconds : null;
}

function pickEnum<T extends string>(value: unknown, allowed: T[]): T | null {
  const text = String(value ?? '').trim().toLowerCase();
  return (allowed as string[]).includes(text) ? (text as T) : null;
}

/**
 * Check the pasted JSON.
 *
 * Errors block the save. Warnings do not: an unknown tag slug or a missing
 * level is worth flagging, but it should not force the teacher back to the
 * chatbot when everything else came back fine. That split is the pattern
 * topic-quick-add.ts established.
 */
export function validateVideoMeta(
  input: unknown,
  allowedTags: AllowedTag[],
): ClassVideoMetaResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: ['Paste a single JSON object (it starts with { and ends with }).'],
      warnings,
      data: null,
    };
  }
  const j = input as ClassVideoMetaJSON;

  const topicPhrase = stripBannedDashes(String(j.topic_phrase ?? '')).trim();
  if (!topicPhrase) errors.push('The JSON has no "topic_phrase". That is the title students search for.');
  if (topicPhrase.length > YT_TITLE_MAX) {
    errors.push(`"topic_phrase" is ${topicPhrase.length} characters. Keep it well under ${YT_TITLE_MAX} so the exam and language still fit in the title.`);
  }

  const hook = stripBannedDashes(String(j.hook ?? '')).trim();
  if (!hook) warnings.push('No "hook" came back. The description will open with the bullet list instead.');

  const bullets = Array.isArray(j.bullets)
    ? j.bullets.map((b) => stripBannedDashes(String(b ?? '')).trim()).filter(Boolean).slice(0, 10)
    : [];
  if (!bullets.length) warnings.push('No "bullets" came back, so the description will not list what the class covered.');

  // Chapters: drop the unparseable ones with a warning, then check the survivors
  // against YouTube's rules. A bad timestamp should not throw away a good list.
  const rawChapters = Array.isArray(j.chapters) ? j.chapters : [];
  const chapters: ClassVideoChapter[] = [];
  let droppedChapters = 0;
  for (const c of rawChapters) {
    const t = parseChapterTime(c?.t ?? c?.time);
    const label = stripBannedDashes(String(c?.label ?? '')).trim();
    if (t === null || !label) {
      droppedChapters += 1;
      continue;
    }
    chapters.push({ t, label });
  }
  chapters.sort((a, b) => a.t - b.t);
  if (droppedChapters) {
    warnings.push(`${droppedChapters} chapter${droppedChapters === 1 ? '' : 's'} had no usable timestamp or label and ${droppedChapters === 1 ? 'was' : 'were'} dropped.`);
  }
  for (const problem of validateChapters(chapters)) {
    warnings.push(problem.message);
  }

  const bySlug = new Map(allowedTags.map((t) => [t.slug.toLowerCase(), t]));
  const tagSlugs: string[] = [];
  const rawSlugs = Array.isArray(j.tag_slugs) ? j.tag_slugs : [];
  for (const raw of rawSlugs) {
    const slug = String(raw ?? '').trim().toLowerCase();
    if (!slug) continue;
    if (!bySlug.has(slug)) {
      warnings.push(`"${slug}" is not a tag in the registry, so it was skipped. Add it under Tags if the topic is real.`);
      continue;
    }
    if (!tagSlugs.includes(slug)) tagSlugs.push(slug);
  }
  if (!tagSlugs.length) {
    warnings.push('No usable topic tags came back. Pick them by hand before saving, or the class will not surface under any topic.');
  }

  const searchTerms = Array.isArray(j.search_terms)
    ? [...new Set(
        j.search_terms
          .map((t) => stripBannedDashes(String(t ?? '')).trim().toLowerCase())
          .filter(Boolean),
      )].slice(0, 20)
    : [];
  if (!searchTerms.length) {
    warnings.push('No "search_terms" came back. Those are what make loose phrasing findable, so add a few by hand.');
  }

  const category = pickEnum<LibraryCategory>(j.category, CATEGORIES);
  if (j.category && !category) {
    warnings.push(`"${j.category}" is not a Library category, so it was left blank. Pick one before saving.`);
  }
  const exam = pickEnum<LibraryVideoExam>(j.exam, EXAMS);
  if (j.exam && !exam) warnings.push(`"${j.exam}" is not a valid exam value, so it was left blank.`);
  const language = pickEnum<LibraryVideoLanguage>(j.language, LANGUAGES);
  if (j.language && !language) warnings.push(`"${j.language}" is not a valid language value, so it was left blank.`);
  const difficulty = pickEnum<LibraryVideoDifficulty>(j.difficulty, DIFFICULTIES);
  if (j.difficulty && !difficulty) warnings.push(`"${j.difficulty}" is not a valid level, so it was left blank.`);

  // The prompt bans em dashes, but models slip. stripBannedDashes already
  // cleaned every field above; this only fires if something new is added later
  // and skips the cleaning.
  if ([topicPhrase, hook, ...bullets].some(hasBannedDashes)) {
    errors.push('The text still contains an em dash or a double dash. Remove it before saving.');
  }

  if (errors.length) return { valid: false, errors, warnings, data: null };

  return {
    valid: true,
    errors,
    warnings,
    data: {
      topicPhrase,
      hook,
      bullets,
      chapters,
      tagSlugs,
      searchTerms,
      category,
      exam,
      language,
      difficulty,
    },
  };
}

/** Tolerant parse: accepts raw JSON, a fenced block, or JSON wrapped in prose. */
export function parseVideoMeta(text: string, allowedTags: AllowedTag[]): ClassVideoMetaResult {
  if (!text?.trim()) {
    return { valid: false, errors: ['Paste the JSON the AI gave you.'], warnings: [], data: null };
  }
  const parsed = extractJsonObject(text);
  if (parsed === null) {
    return {
      valid: false,
      errors: ['That is not valid JSON. Copy the whole JSON block the AI produced.'],
      warnings: [],
      data: null,
    };
  }
  return validateVideoMeta(parsed, allowedTags);
}

/**
 * Server-side guard for the PATCH payload.
 *
 * The teacher can edit every field after the AI produced it, so what reaches
 * the API is not what the validator above saw. This is the last check before
 * anything is stored or handed to YouTube.
 */
export function validateVideoMetaPatch(body: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (typeof body.yt_title === 'string') {
    if (body.yt_title.length > YT_TITLE_MAX) {
      errors.push(`The title is ${body.yt_title.length} characters. YouTube allows ${YT_TITLE_MAX}.`);
    }
    if (hasBannedDashes(body.yt_title)) errors.push('Remove the em dash from the title.');
  }
  if (typeof body.yt_description === 'string') {
    if (body.yt_description.length > YT_DESCRIPTION_MAX) {
      errors.push(`The description is ${body.yt_description.length} characters. YouTube allows ${YT_DESCRIPTION_MAX}.`);
    }
    if (hasBannedDashes(body.yt_description)) errors.push('Remove the em dash from the description.');
  }
  if (Array.isArray(body.yt_tags)) {
    const tags = body.yt_tags.map((t) => String(t ?? ''));
    if (tagsCharCount(tags) > YT_TAGS_MAX_CHARS) {
      errors.push(`The tags add up to ${tagsCharCount(tags)} characters. YouTube allows ${YT_TAGS_MAX_CHARS}.`);
    }
  }
  if (Array.isArray(body.chapters)) {
    const chapters = body.chapters as ClassVideoChapter[];
    if (chapters.some((c) => typeof c?.t !== 'number' || typeof c?.label !== 'string')) {
      errors.push('Every chapter needs a numeric time and a label.');
    } else {
      for (const problem of validateChapters(chapters)) errors.push(problem.message);
    }
  }
  if (body.language !== undefined && body.language !== null && !pickEnum(body.language, LANGUAGES)) {
    errors.push('Pick a valid language.');
  }
  if (body.exam !== undefined && body.exam !== null && !pickEnum(body.exam, EXAMS)) {
    errors.push('Pick a valid exam.');
  }
  if (body.difficulty !== undefined && body.difficulty !== null && !pickEnum(body.difficulty, DIFFICULTIES)) {
    errors.push('Pick a valid level.');
  }
  if (body.category !== undefined && body.category !== null && !pickEnum(body.category, CATEGORIES)) {
    errors.push('Pick a valid category.');
  }
  if (body.status !== undefined && !['draft', 'ready', 'published'].includes(String(body.status))) {
    errors.push('Unknown status.');
  }
  return errors;
}

/** Convenience re-export so the panel imports tag packing from one place. */
export { buildYouTubeTags };
