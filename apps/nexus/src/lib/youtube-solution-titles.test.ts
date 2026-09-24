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

    it('drops the other shift of the same session', () => {
      const v = found('Q no 2 - JEE 2019 Solution Video Session 1 AN - Math Solution');
      expect(matchPaperVideos([v], rows, paper, { paperCountThatYear: 3 }).items).toHaveLength(0);
    });
  });

  /**
   * JEE 2019 Session 1 as prod stores it: Math MCQ Q1 to Q20, Math numerical
   * Q21 to Q25, Aptitude Q26 to Q75, Drawing Q76 to Q83. The channel titles
   * these per section, "Q no 12 - ... - Aptitude Solution".
   */
  describe('a session paper titled per section', () => {
    const paper = { exam_type: 'JEE_PAPER_2', year: 2019, session: 'Session 1', shift: 'forenoon' };
    const sectionOfNumber = (n: number) =>
      n <= 20 ? 'math_mcq' : n <= 25 ? 'math_numerical' : n <= 75 ? 'aptitude' : 'drawing';
    const rows = Array.from({ length: 83 }, (_, i) => row(i + 1, { section: sectionOfNumber(i + 1) as FindRow['section'] }));
    const title = (n: number, section: string, sitting = 'Session 1 - FN') =>
      found(`Q no ${n} -  JEE 2019 Solution Video ${sitting} - ${section} Solution`);

    it('puts Aptitude question 12 on paper Q37, not on the math Q12', () => {
      const result = matchPaperVideos([title(12, 'Aptitude'), title(2, 'Math')], rows, paper, { paperCountThatYear: 4 });
      expect(result.fills.map((f) => [f.questionId, f.number])).toEqual([
        ['q2', 2],
        ['q37', 37],
      ]);
    });

    it('counts a whole run of aptitude titles inside the section, including the numbers that would also fit the paper', () => {
      const videos = Array.from({ length: 50 }, (_, i) => title(i + 1, 'Aptitude'));
      const result = matchPaperVideos(videos, rows, paper, { paperCountThatYear: 4 });
      expect(result.fills).toHaveLength(50);
      expect(result.fills[0]).toMatchObject({ questionId: 'q26', number: 26 });
      // "Q no 30 - Aptitude" is the 30th aptitude question, Q55. Never paper Q30.
      expect(result.fills.find((f) => f.questionId === 'q55')).toBeTruthy();
      expect(result.counts.skipped).toBe(0);
    });

    it('reads the title without a dash between session and shift', () => {
      const v = found('Q no 2 -  JEE 2019 Solution Video Session 1 FN - Math Solution');
      expect(matchPaperVideos([v], rows, paper, { paperCountThatYear: 4 }).fills).toEqual([
        expect.objectContaining({ questionId: 'q2' }),
      ]);
    });

    it('still reads a paper whose titles count across the whole paper', () => {
      const videos = [title(26, 'Aptitude'), title(60, 'Aptitude'), title(75, 'Aptitude')];
      const result = matchPaperVideos(videos, rows, paper, { paperCountThatYear: 4 });
      expect(result.fills.map((f) => f.questionId)).toEqual(['q26', 'q60', 'q75']);
    });

    it('leaves a title for a person when the aptitude titles could be counted either way', () => {
      const result = matchPaperVideos([title(30, 'Aptitude')], rows, paper, { paperCountThatYear: 4 });
      expect(result.fills).toHaveLength(0);
      expect(result.items[0]).toMatchObject({ status: 'skipped-numbering' });
      expect(result.items[0].reason).toContain('Q55');
    });

    it('keeps the newest of two uploads for one section question, reported under the paper number', () => {
      const older = title(12, 'Aptitude');
      older.publishedAt = '2026-01-01T00:00:00Z';
      const newer = title(12, 'Aptitude');
      newer.publishedAt = '2026-02-01T00:00:00Z';
      const result = matchPaperVideos([older, newer], rows, paper, { paperCountThatYear: 4 });
      expect(result.fills).toEqual([{ questionId: 'q37', number: 37, url: `https://www.youtube.com/watch?v=${newer.videoId}` }]);
      expect(result.items.find((i) => i.video === older)).toMatchObject({ status: 'skipped-older', number: 37 });
    });

    it('counts drawing titles inside the drawing section', () => {
      const result = matchPaperVideos([title(1, 'Drawing'), title(2, 'Drawing')], rows, paper, { paperCountThatYear: 4 });
      expect(result.fills.map((f) => f.questionId)).toEqual(['q76', 'q77']);
    });
  });

  describe('a paper whose numbers repeat', () => {
    // 2019 Session 2 (AN) on prod restarts the count in each section.
    const rows = [
      row(1, { id: 'm1', section: 'math_mcq' }),
      row(2, { id: 'm2', section: 'math_mcq' }),
      row(1, { id: 'a1', section: 'aptitude' }),
      row(2, { id: 'a2', section: 'aptitude' }),
      row(2, { id: 'a2-copy', section: 'aptitude' }),
    ];
    const paper = { exam_type: 'JEE_PAPER_2', year: 2019, session: 'Session 2', shift: 'afternoon' };

    it('uses the section word to pick between the sections', () => {
      const v = found('Q no 1 - JEE 2019 Session 2 AN Solution Video - Aptitude Solution');
      expect(matchPaperVideos([v], rows, paper, { paperCountThatYear: 4 }).fills).toEqual([
        expect.objectContaining({ questionId: 'a1' }),
      ]);
    });

    it('asks for the section when the title has none', () => {
      const v = found('Q no 1 - JEE 2019 Session 2 AN Solution Video');
      const item = matchPaperVideos([v], rows, paper, { paperCountThatYear: 4 }).items[0];
      expect(item.status).toBe('skipped-numbering');
      expect(item.reason).toContain('must say Math, Aptitude or Drawing');
    });

    it('never guesses between two copies of one question', () => {
      const v = found('Q no 2 - JEE 2019 Session 2 AN Solution Video - Aptitude Solution');
      const item = matchPaperVideos([v], rows, paper, { paperCountThatYear: 4 }).items[0];
      expect(item.status).toBe('skipped-numbering');
      expect(item.reason).toBe('Q2 appears 2 times on this paper: fix the question numbers first');
    });
  });
});

describe('parseSolutionTitle, the wordings seen on session papers', () => {
  it.each([
    ['Q no 12 -  JEE 2019 Solution Video Session 1 - FN - Aptitude Solution', { number: 12, session: 1, shift: 'forenoon', section: 'aptitude' }],
    ['Q no 2 -  JEE 2019 Solution Video Session 1 FN - Math Solution', { number: 2, session: 1, shift: 'forenoon', section: 'math' }],
    ['Q no 5 - JEE 2019 Solution Video Session 2 - AN - Drawing Solution', { session: 2, shift: 'afternoon', section: 'drawing' }],
    ['Q no 5 - JEE Mains 2020 Session-1 (an) Aptitude Solution', { year: 2020, session: 1, shift: 'afternoon' }],
    ['Q no 5 - JEE Main 2021 Session 01 fn Math Solution', { year: 2021, session: 1, shift: 'forenoon' }],
    ['Q no 5 - JEE (Main) Paper 2 2022 Session II Shift 2 Math Solution', { year: 2022, session: 2, shift: 'afternoon' }],
    ['Q no 5 - JEE 2020 Session 1 Shift 1 Math Solution', { session: 1, shift: 'forenoon' }],
    ['Q no 5 - JEE 2020 Session 1 F.N. Math Solution', { shift: 'forenoon' }],
  ])('%s', (title, expected) => {
    expect(parseSolutionTitle(title)).toMatchObject(expected);
  });

  it('does not read the English word "an" as the afternoon shift', () => {
    expect(parseSolutionTitle('Q no 5 - JEE 2020 an easy Math Solution')?.shift).toBeNull();
  });
});
