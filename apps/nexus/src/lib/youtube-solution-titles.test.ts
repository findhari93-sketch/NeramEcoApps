import { describe, it, expect } from 'vitest';
import {
  parseSolutionTitle,
  matchPaperVideos,
  type FoundVideo,
  type FindRow,
} from './youtube-solution-titles';

describe('parseSolutionTitle', () => {
  it('reads the channel titles as they are written', () => {
    expect(parseSolutionTitle('Q no 22 - JEE 2014 Solution Video - Math Solution')).toEqual({
      number: 22,
      exam: 'JEE_PAPER_2',
      year: 2014,
      section: 'math',
      session: null,
      shift: null,
    });
    expect(parseSolutionTitle('Q no 02 - JEE 2014 Solution Video - Aptitude Solution')).toMatchObject({
      number: 2,
      section: 'aptitude',
    });
    expect(parseSolutionTitle('Q no 78 - JEE 2017 Solution Video - Aptitude Solution')).toMatchObject({
      number: 78,
      year: 2017,
    });
  });

  it('reads the older form, with no section and a double space', () => {
    expect(parseSolutionTitle('Q no  1 - JEE 2005 - Solution Video')).toMatchObject({
      number: 1,
      year: 2005,
      section: null,
    });
  });

  it('reads NATA, sessions and shifts', () => {
    expect(parseSolutionTitle('Q no 5 - NATA 2025 Solution Video - Drawing Solution')).toMatchObject({
      exam: 'NATA',
      section: 'drawing',
    });
    expect(parseSolutionTitle('Q no 12 - JEE 2019 Session 1 Forenoon Solution Video - Math Solution')).toMatchObject({
      session: 1,
      shift: 'forenoon',
    });
    expect(parseSolutionTitle('Q no 12 - JEE 2020 S1 AN Solution Video')).toMatchObject({ session: 1, shift: 'afternoon' });
  });

  it('never takes the year for the question number', () => {
    expect(parseSolutionTitle('JEE 2014 Solution Video - Q no 7')?.number).toBe(7);
  });

  it('ignores videos that are not solution videos', () => {
    expect(parseSolutionTitle('JEE 2014 full paper analysis')).toBeNull();
    expect(parseSolutionTitle('Deleted video')).toBeNull();
    expect(parseSolutionTitle('Q no 5 - JEE 2014 paper discussion')).toBeNull();
    expect(parseSolutionTitle('How to draw a bus stop')).toBeNull();
  });
});

const PAPER_2014 = { exam_type: 'JEE_PAPER_2', year: 2014, session: null, shift: null };

let seq = 0;
function found(title: string, over: Partial<FoundVideo> = {}): FoundVideo {
  seq += 1;
  const parsed = parseSolutionTitle(title)!;
  return {
    videoId: `vid${String(seq).padStart(8, '0')}`,
    title,
    publishedAt: `2026-09-${String(10 + (seq % 15)).padStart(2, '0')}T10:00:00Z`,
    parsed,
    ...over,
  };
}

function row(number: number, over: Partial<FindRow> = {}): FindRow {
  return {
    id: `q${number}`,
    number,
    section: number <= 30 ? 'math_mcq' : 'aptitude',
    savedUrl: null,
    splitDrawing: false,
    ...over,
  };
}

const ROWS = [row(2), row(22), row(31), row(32), row(33)];

describe('matchPaperVideos', () => {
  it('fills a question that has no video, as a canonical link', () => {
    const v = found('Q no 22 - JEE 2014 Solution Video - Math Solution', { videoId: 'U1X9MmLh-ZQ' });
    const result = matchPaperVideos([v], ROWS, PAPER_2014);
    expect(result.fills).toEqual([
      { questionId: 'q22', number: 22, url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' },
    ]);
    expect(result.items[0].status).toBe('new');
    expect(result.counts).toMatchObject({ new: 1, replaces: 0, same: 0, skipped: 0 });
  });

  it('says so when it would replace a link someone pasted by hand', () => {
    const v = found('Q no 31 - JEE 2014 Solution Video - Aptitude Solution', { videoId: 'T9CB0HymAJo' });
    const rows = [row(31, { savedUrl: 'https://www.youtube.com/watch?v=xrKukhHIt0A' })];
    const result = matchPaperVideos([v], rows, PAPER_2014);
    expect(result.items[0]).toMatchObject({ status: 'replaces', savedUrl: 'https://www.youtube.com/watch?v=xrKukhHIt0A' });
    expect(result.fills).toHaveLength(1);
  });

  it('leaves alone a question that already has this video', () => {
    const v = found('Q no 31 - JEE 2014 Solution Video - Aptitude Solution', { videoId: 'T9CB0HymAJo' });
    const rows = [row(31, { savedUrl: 'https://youtu.be/T9CB0HymAJo' })];
    const result = matchPaperVideos([v], rows, PAPER_2014);
    expect(result.items[0].status).toBe('same');
    expect(result.fills).toHaveLength(0);
  });

  it('skips a title whose section disagrees with the question, since the number is probably a typo', () => {
    const v = found('Q no 22 - JEE 2014 Solution Video - Aptitude Solution');
    const result = matchPaperVideos([v], ROWS, PAPER_2014);
    expect(result.items[0]).toMatchObject({ status: 'skipped-section' });
    expect(result.items[0].reason).toBe('The title says Aptitude, but Q22 is in Mathematics (MCQ)');
    expect(result.fills).toHaveLength(0);
  });

  it('does not check the section when the title has none', () => {
    const v = found('Q no  2 - JEE 2014 - Solution Video');
    expect(matchPaperVideos([v], ROWS, PAPER_2014).items[0].status).toBe('new');
  });

  it('keeps the newest of two uploads for one question, and lists the older', () => {
    const older = found('Q no 32 - JEE 2014 Solution Video - Aptitude Solution', { videoId: 'olderVideo1', publishedAt: '2026-09-01T10:00:00Z' });
    const newer = found('Q no 32 - JEE 2014 Solution Video - Aptitude Solution', { videoId: 'newerVideo1', publishedAt: '2026-09-20T10:00:00Z' });
    const result = matchPaperVideos([older, newer], ROWS, PAPER_2014);
    expect(result.fills).toEqual([{ questionId: 'q32', number: 32, url: 'https://www.youtube.com/watch?v=newerVideo1' }]);
    expect(result.items.find((i) => i.video.videoId === 'olderVideo1')?.status).toBe('skipped-older');
  });

  it('skips a number that is not on this paper, and a drawing split into parts', () => {
    const rows = [...ROWS, row(81, { section: 'drawing', splitDrawing: true })];
    const result = matchPaperVideos(
      [found('Q no 99 - JEE 2014 Solution Video'), found('Q no 81 - JEE 2014 Solution Video - Drawing Solution')],
      rows,
      PAPER_2014,
    );
    expect(result.items.map((i) => i.status).sort()).toEqual(['skipped-missing', 'skipped-split']);
  });

  it('drops videos for another exam or year', () => {
    const result = matchPaperVideos([found('Q no 22 - JEE 2015 Solution Video - Math Solution')], ROWS, PAPER_2014);
    expect(result.items).toHaveLength(0);
  });

  describe('a year with several papers', () => {
    const paper = { exam_type: 'JEE_PAPER_2', year: 2019, session: 'Session 1', shift: 'forenoon' };
    const rows = [row(12)];

    it('matches a title that names this session and shift', () => {
      const v = found('Q no 12 - JEE 2019 Session 1 Forenoon Solution Video - Math Solution');
      expect(matchPaperVideos([v], rows, paper, { paperCountThatYear: 3 }).items[0].status).toBe('new');
    });

    it('drops a title for another session without a word', () => {
      const v = found('Q no 12 - JEE 2019 Session 2 Afternoon Solution Video - Math Solution');
      expect(matchPaperVideos([v], rows, paper, { paperCountThatYear: 3 }).items).toHaveLength(0);
    });

    it('skips a title that names no session, because it could be any of them', () => {
      const v = found('Q no 12 - JEE 2019 Solution Video - Math Solution');
      const item = matchPaperVideos([v], rows, paper, { paperCountThatYear: 3 }).items[0];
      expect(item.status).toBe('skipped-no-session');
    });
  });
});
