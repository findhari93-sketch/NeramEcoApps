/**
 * Solution videos on the channel, read by their titles.
 *
 * Every solution video is uploaded unlisted with a title that says which
 * question it solves: "Q no 22 - JEE 2014 Solution Video - Math Solution".
 * "Find on YouTube" lists the channel's uploads, keeps the titles for the
 * paper open on screen, and fills each question's link as an unsaved draft.
 *
 * The title's section word ("Math", "Aptitude") is a free check on the
 * number: a Math title landing on an Aptitude question is almost certainly a
 * typo in the title, so it is skipped and listed, never guessed. Checked
 * against the section stored on the question, never against Q-number ranges:
 * old papers do not follow the modern layout (2015 has Q30 in Maths and Q31
 * in Aptitude).
 */
import { qbSectionLabel, type QBQuestionSection } from '@neram/database';
import { youtubeWatchUrl } from './class-resources';
import { sameSolutionVideo } from './solution-video';

export type TitleSection = 'math' | 'aptitude' | 'drawing';

export interface ParsedSolutionTitle {
  number: number;
  exam: 'JEE_PAPER_2' | 'NATA';
  year: number;
  section: TitleSection | null;
  session: number | null;
  shift: 'forenoon' | 'afternoon' | null;
}

// "Q no 22", "Q.22", "Q 22", "Question 22". One to three digits, so a year
// ("JEE 2014") is never taken for the number.
const Q_LABEL = /\bQ(?:uestion)?\s*(?:no\.?|num(?:ber)?\.?|#)?\s*[-:.)]?\s*(\d{1,3})(?!\d)/i;
const EXAM_YEAR = /\b(JEE|NATA)\b(?:\s*(?:main\s*)?(?:paper\s*2|p2|b\.?\s*arch))?\s*[-,:]?\s*((?:19|20)\d{2})\b/i;
const SOLUTION = /\bsolution/i;

function sectionOf(title: string): TitleSection | null {
  if (/\bmath(?:s|ematics)?\b/i.test(title)) return 'math';
  if (/\baptitude\b/i.test(title)) return 'aptitude';
  if (/\bdrawing\b/i.test(title)) return 'drawing';
  return null;
}

function sessionOf(title: string): number | null {
  const match = /\bsession\s*(\d)\b/i.exec(title) ?? /\bS(\d)\b/.exec(title);
  return match ? Number(match[1]) : null;
}

function shiftOf(title: string): ParsedSolutionTitle['shift'] {
  // FN and AN only in capitals: "an" is an English word.
  if (/\b(forenoon|morning)\b/i.test(title) || /\bFN\b/.test(title)) return 'forenoon';
  if (/\b(afternoon|evening)\b/i.test(title) || /\bAN\b/.test(title)) return 'afternoon';
  return null;
}

/** The question a solution-video title names, or null for any other video. */
export function parseSolutionTitle(title: string): ParsedSolutionTitle | null {
  if (!title || !SOLUTION.test(title)) return null;
  const q = Q_LABEL.exec(title);
  const exam = EXAM_YEAR.exec(title);
  if (!q || !exam) return null;
  const number = Number(q[1]);
  if (!number) return null;
  return {
    number,
    exam: exam[1].toUpperCase() === 'NATA' ? 'NATA' : 'JEE_PAPER_2',
    year: Number(exam[2]),
    section: sectionOf(title),
    session: sessionOf(title),
    shift: shiftOf(title),
  };
}

export interface FoundVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  parsed: ParsedSolutionTitle;
}

/** One question of the paper, as the matcher needs it. */
export interface FindRow {
  id: string;
  /** display_order, else position: the number the paper shows. */
  number: number;
  section: QBQuestionSection | null;
  savedUrl: string | null;
  splitDrawing: boolean;
}

export interface FindPaper {
  exam_type: string;
  year: number;
  session: string | null;
  shift: string | null;
}

export type FindStatus =
  | 'new'
  | 'replaces'
  | 'same'
  | 'skipped-section'
  | 'skipped-missing'
  | 'skipped-split'
  | 'skipped-older'
  | 'skipped-no-session';

export interface FindReviewItem {
  video: FoundVideo;
  status: FindStatus;
  number: number;
  questionId?: string;
  /** The link saved today, for a replacement. */
  savedUrl?: string | null;
  /** Why it was skipped, in a sentence. */
  reason?: string;
}

export interface FindResult {
  fills: { questionId: string; number: number; url: string }[];
  items: FindReviewItem[];
  counts: { new: number; replaces: number; same: number; skipped: number };
}

const SECTION_FITS: Record<TitleSection, QBQuestionSection[]> = {
  math: ['math_mcq', 'math_numerical'],
  aptitude: ['aptitude'],
  drawing: ['drawing'],
};

const SECTION_WORD: Record<TitleSection, string> = { math: 'Math', aptitude: 'Aptitude', drawing: 'Drawing' };

function sessionNumber(session: string | null): number | null {
  const match = /(\d)/.exec(session ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Which found videos go on which questions of this paper, and why the rest do
 * not. Pure: the dialog shows `items`, and "Fill in" hands `fills` to the drafts.
 */
export function matchPaperVideos(
  videos: FoundVideo[],
  rows: FindRow[],
  paper: FindPaper,
  { paperCountThatYear = 1 }: { paperCountThatYear?: number } = {},
): FindResult {
  const items: FindReviewItem[] = [];
  const paperSession = sessionNumber(paper.session);
  const severalPapers = paperCountThatYear > 1;

  // This paper's videos only. On a year with several papers, a title must
  // name this paper's session and shift; one naming another is simply not
  // ours, and one naming neither could be any of them.
  const ours: FoundVideo[] = [];
  for (const v of videos) {
    const p = v.parsed;
    if (p.exam !== paper.exam_type || p.year !== paper.year) continue;
    if (severalPapers) {
      if (p.session != null && paperSession != null && p.session !== paperSession) continue;
      if (p.shift != null && paper.shift && p.shift !== paper.shift) continue;
      const missingSession = paperSession != null && p.session == null;
      const missingShift = !!paper.shift && p.shift == null;
      if (missingSession || missingShift) {
        items.push({
          video: v,
          status: 'skipped-no-session',
          number: p.number,
          reason: `${paper.year} has several papers and this title does not say which: add the session${paper.shift ? ' and shift' : ''}`,
        });
        continue;
      }
    }
    ours.push(v);
  }

  // Two uploads for one question: the newest is the one meant (a re-upload is
  // how a corrected video arrives), and the older is listed, not lost.
  const byNumber = new Map<number, FoundVideo[]>();
  for (const v of ours) {
    const list = byNumber.get(v.parsed.number) ?? [];
    list.push(v);
    byNumber.set(v.parsed.number, list);
  }

  const rowsByNumber = new Map(rows.map((r) => [r.number, r]));
  const fills: FindResult['fills'] = [];

  byNumber.forEach((list, number) => {
    const [winner, ...older] = [...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    for (const v of older) {
      items.push({ video: v, status: 'skipped-older', number, reason: 'An older upload for the same question' });
    }

    const row = rowsByNumber.get(number);
    if (!row) {
      items.push({ video: winner, status: 'skipped-missing', number, reason: `Q${number} is not on this paper` });
      return;
    }
    if (row.splitDrawing) {
      items.push({
        video: winner,
        status: 'skipped-split',
        number,
        questionId: row.id,
        reason: `Q${number} has parts: set its videos per part`,
      });
      return;
    }
    const titleSection = winner.parsed.section;
    if (titleSection && row.section && !SECTION_FITS[titleSection].includes(row.section)) {
      items.push({
        video: winner,
        status: 'skipped-section',
        number,
        questionId: row.id,
        reason: `The title says ${SECTION_WORD[titleSection]}, but Q${number} is in ${qbSectionLabel(row.section)}`,
      });
      return;
    }

    const url = youtubeWatchUrl(winner.videoId);
    const saved = row.savedUrl?.trim() || null;
    if (saved && sameSolutionVideo(saved, url)) {
      items.push({ video: winner, status: 'same', number, questionId: row.id, savedUrl: saved });
      return;
    }
    items.push({ video: winner, status: saved ? 'replaces' : 'new', number, questionId: row.id, savedUrl: saved });
    fills.push({ questionId: row.id, number, url });
  });

  items.sort((a, b) => a.number - b.number);
  fills.sort((a, b) => a.number - b.number);
  const count = (status: FindStatus) => items.filter((i) => i.status === status).length;
  return {
    fills,
    items,
    counts: {
      new: count('new'),
      replaces: count('replaces'),
      same: count('same'),
      skipped: items.filter((i) => i.status.startsWith('skipped')).length,
    },
  };
}
