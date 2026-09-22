/**
 * Which pasted link belongs to which question.
 *
 * Teachers keep their solution videos as a list like
 *
 *   Q no 31  - JEE 2015 Solution Video - Aptitude Solution
 *   https://youtu.be/U1X9MmLh-ZQ
 *
 * with gaps in the numbering. The dialog this replaces took one link per line
 * and sent line N to the Nth question in sorted order, so that list could not
 * be pasted as it was, and on a paper with unnumbered questions "line 31" was
 * not even Q31. This reads the number written next to each link instead.
 *
 * Rules, in order:
 * - A link's number is a label earlier on its own line, else a label on the
 *   nearest non-empty line above it that has no link of its own.
 * - Only when NO link in the paste has a number does line order apply, and then
 *   line N goes to question NUMBER N (blank lines skip), never to position N.
 * - A link with no number in a numbered paste is reported, never guessed.
 * - A repeated number keeps the later link and is reported.
 *
 * PURE: no React, no network.
 */

import { classifySolutionVideo, INVALID_VIDEO_MESSAGE, sameSolutionVideo } from './solution-video';

export interface VideoMatchRow {
  id: string;
  /** The number the row shows: display_order, else its position on the paper. */
  number: number;
  /** What is stored today, so a paste of the same video reads as unchanged. */
  savedUrl?: string | null;
  /** A drawing split into parts, whose videos are set per part. */
  splitDrawing?: boolean;
}

export interface VideoLinkMatch {
  questionId: string;
  number: number;
  /** Canonical: see classifySolutionVideo. */
  url: string;
  /** 1-based line of the link in the paste. */
  line: number;
  unchanged: boolean;
}

export interface VideoLinkUnmatched {
  line: number;
  text: string;
  reason: string;
}

export interface VideoLinkDuplicate {
  number: number;
  lines: number[];
}

export interface VideoLinkMatchResult {
  /** 'labelled' read the numbers beside the links; 'ordered' fell back to line order. */
  mode: 'labelled' | 'ordered' | 'none';
  linkCount: number;
  matches: VideoLinkMatch[];
  unmatched: VideoLinkUnmatched[];
  duplicates: VideoLinkDuplicate[];
}

export const NO_NUMBER_MESSAGE = 'No question number next to this link';

// A link with a scheme, or a bare YouTube address someone copied without one.
const LINK = /https?:\/\/[^\s<>"'`]+|\b(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"'`]+/gi;
// "Q31", "Q.31", "Q no 31", "Q no. 31", "Question 31", "Q#31". One to three
// digits, so the year in "JEE 2015" is never a question number.
const Q_LABEL = /\bQ(?:uestion)?\s*(?:no\.?|num(?:ber)?\.?|#)?\s*[-:.)]?\s*(\d{1,3})(?!\d)/i;
// A line that starts with the number: "31.", "31)", "31 -", "31 ".
const LEADING_NUMBER = /^\s*(\d{1,3})(?=\s*[).:-]|\s|$)/;

function parseLabel(text: string): number | null {
  const q = Q_LABEL.exec(text);
  if (q) return Number(q[1]);
  const lead = LEADING_NUMBER.exec(text);
  return lead ? Number(lead[1]) : null;
}

interface FoundLink {
  line: number;
  raw: string;
  text: string;
  label: number | null;
}

function findLinks(text: string): FoundLink[] {
  const lines = text.split(/\r?\n/);
  const found: FoundLink[] = [];
  let lastNonEmpty: { text: string; hasLink: boolean } | null = null;

  lines.forEach((lineText, index) => {
    const matches = Array.from(lineText.matchAll(LINK));
    let cursor = 0;
    matches.forEach((m, i) => {
      const start = m.index ?? 0;
      // A link at the end of a sentence carries its full stop or bracket.
      const raw = m[0].replace(/[)\],.;:!?]+$/, '');
      const before = lineText.slice(cursor, start);
      cursor = start + m[0].length;

      let label = parseLabel(before);
      // Only the first link on a line may borrow the label line above it.
      if (label === null && i === 0 && before.trim() === '' && lastNonEmpty && !lastNonEmpty.hasLink) {
        label = parseLabel(lastNonEmpty.text);
      }
      found.push({ line: index + 1, raw, text: lineText.trim(), label });
    });

    if (lineText.trim()) lastNonEmpty = { text: lineText, hasLink: matches.length > 0 };
  });

  return found;
}

/** How many links a paste holds: one stays a one-field paste, more go to the matcher. */
export function countVideoLinks(text: string): number {
  return findLinks(text).length;
}

export interface MatchOptions {
  /**
   * For a paste with no numbers: the question line 1 goes to. A column of links
   * pasted into Q31's field fills Q31, Q32 and on, like a spreadsheet. Ignored
   * when the paste names its own questions.
   */
  startAt?: number;
}

export function matchVideoLinks(
  text: string,
  rows: VideoMatchRow[],
  { startAt = 1 }: MatchOptions = {},
): VideoLinkMatchResult {
  const links = findLinks(text);
  if (links.length === 0) {
    return { mode: 'none', linkCount: 0, matches: [], unmatched: [], duplicates: [] };
  }

  const mode: 'labelled' | 'ordered' = links.some((l) => l.label !== null) ? 'labelled' : 'ordered';

  const byNumber = new Map<number, VideoMatchRow>();
  for (const row of rows) if (!byNumber.has(row.number)) byNumber.set(row.number, row);

  const matched = new Map<number, VideoLinkMatch>();
  const seenLines = new Map<number, number[]>();
  const unmatched: VideoLinkUnmatched[] = [];

  for (const link of links) {
    const number = mode === 'ordered' ? link.line + startAt - 1 : link.label;
    if (number === null) {
      unmatched.push({ line: link.line, text: link.text, reason: NO_NUMBER_MESSAGE });
      continue;
    }

    const video = classifySolutionVideo(/^https?:\/\//i.test(link.raw) ? link.raw : `https://${link.raw}`);
    if (video.kind !== 'youtube' && video.kind !== 'sharepoint') {
      unmatched.push({ line: link.line, text: link.text, reason: INVALID_VIDEO_MESSAGE });
      continue;
    }

    const row = byNumber.get(number);
    if (!row) {
      unmatched.push({ line: link.line, text: link.text, reason: `Q${number} is not on this paper` });
      continue;
    }
    if (row.splitDrawing) {
      unmatched.push({ line: link.line, text: link.text, reason: `Q${number} has parts: set its videos per part` });
      continue;
    }

    seenLines.set(number, [...(seenLines.get(number) ?? []), link.line]);
    matched.set(number, {
      questionId: row.id,
      number,
      url: video.url,
      line: link.line,
      unchanged: sameSolutionVideo(video.url, row.savedUrl),
    });
  }

  const duplicates = Array.from(seenLines.entries())
    .filter(([, lines]) => lines.length > 1)
    .map(([number, lines]) => ({ number, lines }))
    .sort((a, b) => a.number - b.number);

  return {
    mode,
    linkCount: links.length,
    matches: Array.from(matched.values()).sort((a, b) => a.number - b.number),
    unmatched,
    duplicates,
  };
}
