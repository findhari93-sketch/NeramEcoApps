import { describe, it, expect } from 'vitest';
import { describeTestOrigin, formatOriginDate } from './test-origin';

/**
 * Where a test came from, said out loud.
 *
 * Every fact here has been stored since the import table shipped and none of it
 * has ever reached a screen. A teacher who uploads 150 questions currently has
 * no way to answer "which file was that", "did any rows get dropped" or "is this
 * the paper I built for chapter one", which is the whole reason the archive
 * exists.
 *
 * The rule throughout: state only what is actually recorded. A line that pads
 * itself with defaults teaches a teacher to distrust the whole panel.
 */

const meta = {
  serve: 50,
  file_name: 'history_of_architecture_ch1.json',
  folder_path: ['Foundation', 'History of Architecture - Chapter 1'],
  passing_pct: 70,
  rows_skipped: 0,
  questions_read: 150,
  source_file_title: 'Ch:1 History Of Architecture',
};

describe('describeTestOrigin', () => {
  it('names the uploaded file, which is the fact a teacher asks for first', () => {
    const out = describeTestOrigin({
      source: 'file_upload',
      created_from: 'study_upload',
      prompt_meta: meta,
      created_at: '2026-08-06T16:32:54.794Z',
    });
    expect(out.headline).toContain('history_of_architecture_ch1.json');
    expect(out.fileName).toBe('history_of_architecture_ch1.json');
  });

  it('names the chapter the test was built for', () => {
    const out = describeTestOrigin({
      source: 'file_upload',
      created_from: 'study_upload',
      prompt_meta: meta,
      created_at: null,
    });
    expect(out.details.join(' | ')).toContain('Ch:1 History Of Architecture');
  });

  it('reports rows that were dropped, and stays silent when none were', () => {
    // A silent skip is how a 150-question upload quietly becomes a 148-question
    // paper. Saying "0 skipped" every time trains people to stop reading it.
    const clean = describeTestOrigin({ source: 'file_upload', prompt_meta: meta });
    expect(clean.details.join(' ')).not.toMatch(/skipped/i);

    const lossy = describeTestOrigin({
      source: 'file_upload',
      prompt_meta: { ...meta, rows_skipped: 3 },
    });
    expect(lossy.details.join(' ')).toMatch(/3 rows skipped/i);
    expect(lossy.hasLoss).toBe(true);
  });

  it('distinguishes the ways a test can be made', () => {
    expect(describeTestOrigin({ source: 'paste', prompt_meta: {} }).headline).toMatch(/pasted/i);
    expect(describeTestOrigin({ source: 'pdf_generate', prompt_meta: meta }).headline).toMatch(/written by ai/i);
    expect(describeTestOrigin({ source: 'edit', prompt_meta: {} }).headline).toMatch(/edited/i);
  });

  it('falls back honestly for a test that predates the archive', () => {
    // Every test built before nexus_test_imports existed has no row at all.
    // Claiming an origin for those would be a guess presented as a record.
    const out = describeTestOrigin(null);
    expect(out.headline).toMatch(/not recorded/i);
    expect(out.details).toEqual([]);
    expect(out.fileName).toBe(null);
  });

  it('survives a prompt_meta that is missing, empty or the wrong shape', () => {
    for (const prompt_meta of [undefined, null, {}, 'nonsense', 42] as any[]) {
      const out = describeTestOrigin({ source: 'file_upload', prompt_meta });
      expect(typeof out.headline).toBe('string');
      expect(out.headline.length).toBeGreaterThan(0);
      expect(Array.isArray(out.details)).toBe(true);
    }
  });

  it('describes an upload with no filename without leaving a dangling "from"', () => {
    const out = describeTestOrigin({ source: 'file_upload', prompt_meta: { questions_read: 12 } });
    expect(out.headline).not.toMatch(/from\s*$/);
    expect(out.headline).toMatch(/uploaded/i);
  });

  it('reads the pool setting, because 150 held and 50 asked are different numbers', () => {
    const out = describeTestOrigin({ source: 'file_upload', prompt_meta: meta });
    expect(out.details.join(' ')).toMatch(/150 read/i);
    expect(out.details.join(' ')).toMatch(/50 asked each attempt/i);
  });
});

describe('formatOriginDate', () => {
  it('formats in UTC so the same row reads the same everywhere', () => {
    // Deliberately not toLocaleDateString: a test asserting local formatting
    // passes in one timezone and fails in CI.
    expect(formatOriginDate('2026-08-06T16:32:54.794Z')).toBe('6 Aug 2026');
    expect(formatOriginDate('2026-01-01T00:00:00.000Z')).toBe('1 Jan 2026');
  });

  it('returns nothing usable rather than "Invalid Date"', () => {
    for (const raw of [null, undefined, '', 'not-a-date', 42] as any[]) {
      expect(formatOriginDate(raw)).toBe('');
    }
  });
});
