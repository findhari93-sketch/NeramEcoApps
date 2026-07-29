/**
 * Build the title, description and tags that go into YouTube Studio for a class
 * recording, and that the student Library then searches.
 *
 * Pure functions, no I/O. Everything here obeys YouTube's real limits, because
 * Studio silently truncates instead of warning: title 100 characters,
 * description 5000, and the tags box 500 characters counted across all tags
 * with separators.
 *
 * Two audiences, one text. YouTube reads the first two lines of the description
 * in search results, and the Nexus search_vector indexes the same description at
 * weight C with the topic and search-term lines at weight B. Writing it once for
 * both is the point of this module.
 */

import type {
  ClassVideoChapter,
  LibraryVideoDifficulty,
  LibraryVideoExam,
  LibraryVideoLanguage,
} from '@neram/database/types';

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
export const YT_TAGS_MAX_CHARS = 500;

/** YouTube needs at least three markers, starting at 0:00, to render chapters. */
export const YT_MIN_CHAPTERS = 3;
/** YouTube ignores chapters closer together than ten seconds. */
export const YT_MIN_CHAPTER_GAP_SECONDS = 10;

export const EXAM_LABELS: Record<LibraryVideoExam, string> = {
  nata: 'NATA',
  jee_barch: 'JEE B.Arch',
  both: 'NATA + JEE B.Arch',
  general: 'All architecture aspirants',
};

/** Longer form, for the "Exam" line inside the description. */
export const EXAM_LONG_LABELS: Record<LibraryVideoExam, string> = {
  nata: 'NATA',
  jee_barch: 'JEE B.Arch Paper 2',
  both: 'NATA, JEE B.Arch Paper 2',
  general: 'NATA, JEE B.Arch Paper 2',
};

export const LANGUAGE_LABELS: Record<LibraryVideoLanguage, string> = {
  ta: 'Tamil',
  en: 'English',
  ta_en: 'Tamil and English',
};

export const DIFFICULTY_LABELS: Record<LibraryVideoDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  mixed: 'All levels',
};

const CHANNEL_FOOTER =
  'Neram Classes, architecture entrance coaching for NATA and JEE B.Arch.';

/**
 * Strip the punctuation the repo content rules ban from user-visible text.
 * Applied to every AI-produced string before it reaches YouTube or a student.
 */
export function stripBannedDashes(text: string): string {
  return (text || '')
    .replace(/&mdash;/g, ', ')
    .replace(/—/g, ', ')
    .replace(/–/g, ', ')
    .replace(/(\S)\s--\s(\S)/g, '$1, $2')
    .replace(/\s{2,}/g, ' ');
}

export function hasBannedDashes(text: string): boolean {
  return /—|–|&mdash;|\s--\s/.test(text || '');
}

/** Seconds to the m:ss or h:mm:ss form YouTube parses as a chapter marker. */
export function formatChapterTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** "2:14" or "1:01:30" to seconds. Null when the text is not a timestamp. */
function timestampToSeconds(text: string): number | null {
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  return parts.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}

/**
 * Read the chapter list back out of a description.
 *
 * The description is the only place chapters exist on YouTube, so it is the
 * single source of truth here too. Parsing rather than storing a duplicate
 * column means the Library shows chapters for any video whose description
 * carries timestamps, including the several hundred already on the channel that
 * predate this feature.
 *
 * Returns an empty array unless the list satisfies YouTube's own rules, so what
 * Nexus renders and what YouTube renders never disagree.
 */
export function parseChaptersFromDescription(description: string | null): ClassVideoChapter[] {
  if (!description) return [];

  const found: ClassVideoChapter[] = [];
  for (const rawLine of description.split('\n')) {
    const line = rawLine.trim();
    // Timestamp first, then the label. A timestamp mid-sentence is prose.
    const match = /^(\d{1,2}:\d{2}(?::\d{2})?)[\s–-]*(.*)$/.exec(line);
    if (!match) continue;
    const seconds = timestampToSeconds(match[1]);
    const label = match[2].trim();
    if (seconds === null || !label) continue;
    found.push({ t: seconds, label });
  }

  if (found.length < YT_MIN_CHAPTERS) return [];
  if (found[0].t !== 0) return [];
  for (let i = 1; i < found.length; i += 1) {
    if (found[i].t - found[i - 1].t < YT_MIN_CHAPTER_GAP_SECONDS) return [];
  }
  return found;
}

export interface ChapterProblem {
  message: string;
}

/**
 * Check a chapter list against YouTube's rules. Returns the problems rather
 * than throwing, so the teacher sees them all at once instead of one per save.
 */
export function validateChapters(chapters: ClassVideoChapter[]): ChapterProblem[] {
  const problems: ChapterProblem[] = [];
  if (!chapters.length) return problems; // chapters are optional

  if (chapters.length < YT_MIN_CHAPTERS) {
    problems.push({
      message: `YouTube needs at least ${YT_MIN_CHAPTERS} chapters to show them. You have ${chapters.length}. Add more or remove them all.`,
    });
  }
  if (chapters[0].t !== 0) {
    problems.push({
      message: 'The first chapter has to start at 0:00, otherwise YouTube ignores the whole list.',
    });
  }
  for (let i = 1; i < chapters.length; i += 1) {
    if (chapters[i].t <= chapters[i - 1].t) {
      problems.push({
        message: `Chapter "${chapters[i].label}" is not after the one before it.`,
      });
      break;
    }
    if (chapters[i].t - chapters[i - 1].t < YT_MIN_CHAPTER_GAP_SECONDS) {
      problems.push({
        message: `Chapters have to be at least ${YT_MIN_CHAPTER_GAP_SECONDS} seconds apart. "${chapters[i].label}" is too close to the one before it.`,
      });
      break;
    }
  }
  if (chapters.some((c) => !c.label.trim())) {
    problems.push({ message: 'Every chapter needs a label.' });
  }
  return problems;
}

export interface TitleParts {
  /** The topic in the words a student would use. Always kept. */
  topic: string;
  exam: LibraryVideoExam | null;
  /** Subject label, for example "Drawing". Dropped first when space runs out. */
  subject?: string | null;
  language: LibraryVideoLanguage | null;
}

/**
 * Build the YouTube title.
 *
 * Keywords go first: roughly 60 characters are visible on a phone, and the
 * topic is the only part a student scans for. Exam, subject and language follow
 * in that order, and any segment that would cross the 100-character limit is
 * skipped rather than truncated mid-word. A skipped segment does not stop the
 * ones after it, so a short language tag can still land in space a longer
 * subject could not use. Filling the title beats leaving it half empty.
 */
export function buildYouTubeTitle(parts: TitleParts): string {
  const topic = stripBannedDashes(parts.topic || '').trim();
  if (!topic) return '';

  const optional: string[] = [];
  if (parts.exam) optional.push(EXAM_LABELS[parts.exam]);
  if (parts.subject) optional.push(stripBannedDashes(parts.subject).trim());
  if (parts.language) optional.push(LANGUAGE_LABELS[parts.language]);

  let title = topic.slice(0, YT_TITLE_MAX);
  for (const segment of optional) {
    if (!segment) continue;
    const candidate = `${title} | ${segment}`;
    if (candidate.length <= YT_TITLE_MAX) title = candidate;
  }
  return title;
}

export interface DescriptionParts {
  /** One sentence on what the class teaches. Shown in YouTube search results. */
  hook: string;
  /** "In this class" points. */
  bullets: string[];
  chapters: ClassVideoChapter[];
  /** Canonical topic labels from the tag registry. */
  topics: string[];
  /** Alias expansion, the line that makes loose phrasing findable. */
  searchTerms: string[];
  exam: LibraryVideoExam | null;
  difficulty: LibraryVideoDifficulty | null;
  language: LibraryVideoLanguage | null;
  /** ISO date (yyyy-mm-dd) of the class. */
  classDate?: string | null;
  tutorName?: string | null;
}

/** "2026-07-12" to "12 July 2026". Naive parse: the class date has no timezone. */
function formatClassDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [, y, m, d] = match;
  const monthName = months[Number(m) - 1];
  if (!monthName) return iso;
  return `${Number(d)} ${monthName} ${y}`;
}

/**
 * Build the YouTube description.
 *
 * Section order is deliberate. The hook is first because YouTube shows only the
 * opening lines in search results. Chapters come before the metadata block
 * because YouTube scans for the 0:00 marker. The "Search terms" line is last of
 * the content because it is written for search, not for reading.
 */
export function buildYouTubeDescription(parts: DescriptionParts): string {
  const blocks: string[] = [];

  const hook = stripBannedDashes(parts.hook || '').trim();
  if (hook) blocks.push(hook);

  const bullets = (parts.bullets || [])
    .map((b) => stripBannedDashes(b).trim())
    .filter(Boolean);
  if (bullets.length) {
    blocks.push(['In this class:', ...bullets.map((b) => `- ${b}`)].join('\n'));
  }

  const chapters = parts.chapters || [];
  if (chapters.length) {
    blocks.push(
      [
        'Chapters',
        ...chapters.map((c) => `${formatChapterTime(c.t)} ${stripBannedDashes(c.label).trim()}`),
      ].join('\n'),
    );
  }

  const facts: string[] = [];
  const topics = (parts.topics || []).map((t) => t.trim()).filter(Boolean);
  if (topics.length) facts.push(`Topic: ${topics.join(', ')}`);
  if (parts.exam) facts.push(`Exam: ${EXAM_LONG_LABELS[parts.exam]}`);
  if (parts.difficulty) facts.push(`Level: ${DIFFICULTY_LABELS[parts.difficulty]}`);
  if (parts.language) facts.push(`Language: ${LANGUAGE_LABELS[parts.language]}`);
  if (parts.classDate) facts.push(`Class date: ${formatClassDate(parts.classDate)}`);
  if (parts.tutorName) facts.push(`Tutor: ${parts.tutorName.trim()}`);
  if (facts.length) blocks.push(facts.join('\n'));

  const searchTerms = (parts.searchTerms || []).map((t) => t.trim()).filter(Boolean);
  if (searchTerms.length) blocks.push(`Search terms: ${searchTerms.join(', ')}`);

  blocks.push(CHANNEL_FOOTER);

  const full = blocks.join('\n\n');
  if (full.length <= YT_DESCRIPTION_MAX) return full;

  // Over budget. Drop whole blocks from the end rather than cutting mid-sentence,
  // but always keep the footer so the channel line never goes missing.
  const trimmed = [...blocks];
  while (trimmed.length > 2 && trimmed.join('\n\n').length > YT_DESCRIPTION_MAX) {
    trimmed.splice(trimmed.length - 2, 1);
  }
  return trimmed.join('\n\n').slice(0, YT_DESCRIPTION_MAX);
}

/**
 * Pack the YouTube tags box.
 *
 * YouTube counts 500 characters across every tag plus its separators, so this
 * fills in priority order (canonical topics, then search terms, then exam
 * names) and stops at the limit instead of letting Studio drop the tail
 * silently. Duplicates are removed case insensitively.
 */
export function buildYouTubeTags(input: {
  topics: string[];
  searchTerms: string[];
  exam: LibraryVideoExam | null;
}): string[] {
  const ordered = [
    ...(input.topics || []),
    ...(input.searchTerms || []),
    ...(input.exam ? [EXAM_LONG_LABELS[input.exam]] : []),
    'architecture entrance exam',
  ];

  const seen = new Set<string>();
  const tags: string[] = [];
  let used = 0;

  for (const raw of ordered) {
    const tag = stripBannedDashes(String(raw || ''))
      .replace(/[,"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    // +1 for the separator YouTube counts between tags.
    const cost = tag.length + (tags.length ? 1 : 0);
    if (used + cost > YT_TAGS_MAX_CHARS) continue;

    seen.add(key);
    tags.push(tag);
    used += cost;
  }
  return tags;
}

/** Total characters YouTube counts for a tag list, separators included. */
export function tagsCharCount(tags: string[]): number {
  if (!tags.length) return 0;
  return tags.reduce((sum, t) => sum + t.length, 0) + (tags.length - 1);
}
