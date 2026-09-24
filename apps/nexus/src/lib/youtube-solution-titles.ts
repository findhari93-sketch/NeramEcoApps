/**
 * Solution videos on the channel, read by their titles.
 *
 * Every solution video is uploaded unlisted with a title that says which
 * question it solves: "Q no 22 - JEE 2014 Solution Video - Math Solution".
 * "Find on YouTube" lists the channel's uploads, keeps the titles for the
 * paper open on screen, and fills each question's link as an unsaved draft.
 *
 * The title's section word ("Math", "Aptitude") does two jobs. It is a free
 * check on the number: a Math title landing on an Aptitude question is almost
 * certainly a typo in the title, so it is skipped and listed, never guessed.
 * And it says which count the number belongs to, because the session papers
 * (2019 on) are titled per section: "Q no 12 - Aptitude" is the twelfth
 * aptitude question, not paper Q12. Checked against the section stored on the
 * question, never against Q-number ranges: old papers do not follow the modern
 * layout (2015 has Q30 in Maths and Q31 in Aptitude).
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
// "JEE 2019", "JEE Main 2019", "JEE Mains 2019", "JEE (Main) Paper 2 2019",
// "JEE B.Arch 2019", "NATA 2025".
const EXAM_YEAR =
  /\b(JEE|NATA)\b(?:\s*\(?\s*mains?\s*\)?)?(?:\s*(?:paper\s*-?\s*2|p2|b\.?\s*arch))?\s*[-,:]?\s*((?:19|20)\d{2})\b/i;
const SOLUTION = /\bsolution/i;

function sectionOf(title: string): TitleSection | null {
  if (/\bmath(?:s|ematics)?\b/i.test(title)) return 'math';
  if (/\baptitude\b/i.test(title)) return 'aptitude';
  if (/\bdrawing\b/i.test(title)) return 'drawing';
  return null;
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

function sessionOf(title: string): number | null {
  // "Session 1", "Session-1", "Session 01", "Session: 2", "Session II", "S1".
  const digit = /\bsession\s*[-:#.]?\s*0?(\d)\b/i.exec(title) ?? /\bS(\d)\b/.exec(title);
  if (digit) return Number(digit[1]);
  const roman = /\bsession\s*[-:#.]?\s*(iv|i{1,3})\b/i.exec(title);
  return roman ? ROMAN[roman[1].toLowerCase()] : null;
}

function shiftOf(title: string): ParsedSolutionTitle['shift'] {
  if (/\b(forenoon|morning|first\s+shift)\b/i.test(title)) return 'forenoon';
  if (/\b(afternoon|evening|second\s+shift)\b/i.test(title)) return 'afternoon';
  // "FN", "F.N.", "fn". Never a word, so any case.
  if (/\bF\.?N\b/i.test(title)) return 'forenoon';
  // "AN" and "A.N." only in capitals, or lowercase in brackets: "an" is an
  // English word.
  if (/\bA\.?N\b/.test(title) || /\(\s*a\.?n\.?\s*\)/i.test(title)) return 'afternoon';
  // NTA's own names: Shift 1 is the morning sitting, Shift 2 the afternoon.
  const shift = /\bshift\s*[-:#.]?\s*0?([12])\b/i.exec(title);
  if (shift) return shift[1] === '1' ? 'forenoon' : 'afternoon';
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
  | 'skipped-no-session'
  | 'skipped-numbering';

export interface FindReviewItem {
  video: FoundVideo;
  status: FindStatus;
  /** The paper's question number when the title was placed, else the title's. */
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
 * How one section's titles count their questions.
 *
 * The channel is not consistent. The older papers count across the whole
 * paper ("Q no 78 - Aptitude"); the session papers count from 1 inside each
 * section ("Q no 12 - Aptitude" is the twelfth aptitude question, stored as
 * Q37 when aptitude starts at Q26). `offset` is the number of the last
 * question before the section, so section question n is paper question
 * offset + n. Zero when the section opens the paper, or when the paper itself
 * restarts the count in each section: then both counts agree.
 */
interface SectionGroup {
  byNumber: Map<number, FindRow[]>;
  offset: number;
  /** Settled from the titles themselves, null while they could be either. */
  mode: 'section' | 'paper' | null;
}

function indexByNumber(rows: FindRow[]): Map<number, FindRow[]> {
  const map = new Map<number, FindRow[]>();
  for (const r of rows) {
    const list = map.get(r.number) ?? [];
    list.push(r);
    map.set(r.number, list);
  }
  return map;
}

function buildGroup(rows: FindRow[], section: TitleSection): SectionGroup | null {
  const own = rows.filter((r) => r.section != null && SECTION_FITS[section].includes(r.section));
  if (own.length === 0) return null;
  const ownIds = new Set(own.map((r) => r.id));
  const first = Math.min(...own.map((r) => r.number));
  const before = rows.filter((r) => !ownIds.has(r.id) && r.number < first).map((r) => r.number);
  return { byNumber: indexByNumber(own), offset: before.length ? Math.max(...before) : 0, mode: null };
}

/** The rows a title number could mean in its section, counted each way. */
function groupCandidates(group: SectionGroup, n: number): { section: FindRow[]; paper: FindRow[] } {
  return { section: group.byNumber.get(group.offset + n) ?? [], paper: group.byNumber.get(n) ?? [] };
}

/**
 * Settle each section's count from the titles that only fit one way. A few
 * "Q no 12 - Aptitude" on a paper whose aptitude starts at Q26 can only be
 * counted inside the section, so that section's "Q no 30" is its thirtieth
 * question too, never paper Q30. A tie stays unsettled, and a title that fits
 * both ways is then left for a person rather than guessed.
 */
function settleModes(groups: Map<TitleSection, SectionGroup>, videos: FoundVideo[]): void {
  const votes = new Map<TitleSection, { section: number; paper: number }>();
  for (const v of videos) {
    const s = v.parsed.section;
    const group = s ? groups.get(s) : undefined;
    if (!s || !group || group.offset === 0) continue;
    const c = groupCandidates(group, v.parsed.number);
    const tally = votes.get(s) ?? { section: 0, paper: 0 };
    if (c.section.length && !c.paper.length) tally.section += 1;
    if (c.paper.length && !c.section.length) tally.paper += 1;
    votes.set(s, tally);
  }
  votes.forEach((tally, s) => {
    const group = groups.get(s)!;
    group.mode = tally.section > tally.paper ? 'section' : tally.paper > tally.section ? 'paper' : null;
  });
}

type Resolution =
  | { ok: true; row: FindRow }
  | { ok: false; status: FindStatus; reason: string; row?: FindRow };

/** The one question a title names on this paper, or why there is not one. */
function resolveVideo(
  v: FoundVideo,
  rowsByNumber: Map<number, FindRow[]>,
  groups: Map<TitleSection, SectionGroup>,
): Resolution {
  const n = v.parsed.number;
  const titleSection = v.parsed.section;
  const group = titleSection ? groups.get(titleSection) : undefined;
  let candidates: FindRow[];

  if (titleSection && group) {
    const word = SECTION_WORD[titleSection];
    if (group.offset === 0) {
      candidates = group.byNumber.get(n) ?? [];
    } else {
      const c = groupCandidates(group, n);
      if (c.section.length && c.paper.length) {
        if (!group.mode) {
          return {
            ok: false,
            status: 'skipped-numbering',
            reason: `Could be Q${group.offset + n} (${word} question ${n}) or Q${n}: the ${word} titles do not show how they are counted`,
          };
        }
        candidates = group.mode === 'section' ? c.section : c.paper;
      } else if (c.section.length || c.paper.length) {
        const fits = c.section.length ? 'section' : 'paper';
        if (group.mode && group.mode !== fits) {
          return {
            ok: false,
            status: 'skipped-numbering',
            reason:
              group.mode === 'section'
                ? `The other ${word} titles count from 1 inside the section, and ${word} question ${n} is not on this paper`
                : `The other ${word} titles count across the whole paper, and Q${n} is not a ${word} question`,
          };
        }
        candidates = fits === 'section' ? c.section : c.paper;
      } else {
        candidates = [];
      }
    }
    if (candidates.length === 0) {
      const elsewhere = rowsByNumber.get(n) ?? [];
      const other = elsewhere.length === 1 ? elsewhere[0] : undefined;
      if (other?.section && !SECTION_FITS[titleSection].includes(other.section)) {
        return {
          ok: false,
          status: 'skipped-section',
          row: other,
          reason: `The title says ${word}, but Q${n} is in ${qbSectionLabel(other.section)}`,
        };
      }
      return { ok: false, status: 'skipped-missing', reason: `${word} question ${n} is not on this paper` };
    }
  } else {
    candidates = rowsByNumber.get(n) ?? [];
    if (candidates.length === 0) {
      return { ok: false, status: 'skipped-missing', reason: `Q${n} is not on this paper` };
    }
  }

  if (candidates.length > 1) {
    const sections = new Set(candidates.map((r) => r.section ?? '__none__'));
    return {
      ok: false,
      status: 'skipped-numbering',
      reason:
        !titleSection && sections.size > 1
          ? `Q${n} is in more than one section of this paper: the title must say Math, Aptitude or Drawing`
          : `Q${candidates[0].number} appears ${candidates.length} times on this paper: fix the question numbers first`,
    };
  }

  const row = candidates[0];
  // A section word the stored section disagrees with. Only reachable when the
  // paper has no rows of that section, so the number was looked up across the
  // whole paper.
  if (titleSection && row.section && !SECTION_FITS[titleSection].includes(row.section)) {
    return {
      ok: false,
      status: 'skipped-section',
      row,
      reason: `The title says ${SECTION_WORD[titleSection]}, but Q${row.number} is in ${qbSectionLabel(row.section)}`,
    };
  }
  return { ok: true, row };
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

  const rowsByNumber = indexByNumber(rows);
  const groups = new Map<TitleSection, SectionGroup>();
  (Object.keys(SECTION_FITS) as TitleSection[]).forEach((s) => {
    const group = buildGroup(rows, s);
    if (group) groups.set(s, group);
  });
  settleModes(groups, ours);

  // Titles to questions first, then duplicates by question, since two titles
  // numbered differently can name the same question.
  const byRow = new Map<string, { row: FindRow; videos: FoundVideo[] }>();
  for (const v of ours) {
    const r = resolveVideo(v, rowsByNumber, groups);
    if (!r.ok) {
      items.push({
        video: v,
        status: r.status,
        number: r.row?.number ?? v.parsed.number,
        questionId: r.row?.id,
        reason: r.reason,
      });
      continue;
    }
    const entry = byRow.get(r.row.id) ?? { row: r.row, videos: [] };
    entry.videos.push(v);
    byRow.set(r.row.id, entry);
  }

  const fills: FindResult['fills'] = [];

  byRow.forEach(({ row, videos: list }) => {
    const number = row.number;
    // Two uploads for one question: the newest is the one meant (a re-upload
    // is how a corrected video arrives), and the older is listed, not lost.
    const [winner, ...older] = [...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    for (const v of older) {
      items.push({ video: v, status: 'skipped-older', number, questionId: row.id, reason: 'An older upload for the same question' });
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
