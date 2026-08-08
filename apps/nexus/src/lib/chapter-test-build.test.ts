import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildChapterTest } from './chapter-test-build';
import type { ImportQuestion, ImportValidationResult } from './qb-import-schema';

vi.mock('@neram/database', () => ({
  getFolderById: vi.fn(async () => ({ id: 'folder-1', name: 'Foundation' })),
  linkTestToStudyFile: vi.fn(async () => ({ placement_id: 'placement-1' })),
}));

vi.mock('./qb-import-service', () => ({
  dedupeImportRows: vi.fn(async () => ({ results: [], summary: { create: 0, reuse: 0, review: 0 } })),
  commitImport: vi.fn(async () => ({
    test_id: 'test-1',
    folder_id: 'tf-1',
    question_count: 2,
    created: 2,
    reused: 0,
    merged: 0,
    replaced: 0,
    kept_both: 0,
    skipped: 0,
    tags_created: 0,
    tags_linked: 0,
    question_ids: ['q-1', 'q-2'],
  })),
}));

vi.mock('./test-import-store', () => ({
  saveTestImportPayload: vi.fn(async () => undefined),
}));

import { getFolderById, linkTestToStudyFile } from '@neram/database';
import { commitImport, dedupeImportRows } from './qb-import-service';
import { saveTestImportPayload } from './test-import-store';

const FILE = { id: 'file-1', title: 'Ch:1 History Of Architecture', folder_id: 'folder-1' };

function question(key: string, text: string, quote: string | null = null): ImportQuestion {
  return {
    key,
    question_text: text,
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'Agra' },
      { id: 'b', text: 'Old Delhi' },
    ],
    correct_answer: 'b',
    explanation: 'Because it is.',
    difficulty: 'MEDIUM',
    exam_relevance: 'NATA',
    source_quote: quote,
    tag_ids: ['tag-hoa'],
    tag_slugs: ['history_of_architecture'],
    new_tag_slugs: [],
  };
}

function parsed(questions: ImportQuestion[], folderPath: string[] = []): ImportValidationResult {
  return {
    test: { title: '', folder_path: folderPath },
    questions,
    proposedTags: [],
    errors: [],
    warnings: [],
    // The AI reply this stands in for never labels itself, so it parses as
    // unlabelled. Chapter-test building does not read this field either way.
    schema: { name: null, version: null, recognised: false },
  };
}

const BASE = {
  file: FILE,
  serve: 20,
  passingPct: 70,
  callerId: 'user-1',
  source: 'file_upload' as const,
  createdFrom: 'study_upload',
  promptMeta: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildChapterTest', () => {
  it('creates a row per question when the bank has nothing like them', async () => {
    const questions = [question('q0', 'Which city is Shahjahanabad?'), question('q1', 'Who built Fatehpur Sikri?')];
    await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    const rows = (commitImport as any).mock.calls[0][0].rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.action === 'create')).toBe(true);
    expect(rows.every((r: any) => r.existing_question_id === null)).toBe(true);
  });

  it('reuses the bank question when the dedupe says it is the same one', async () => {
    // The reuse path keeps the existing question's attempt history and tags
    // attached, so a second upload of the same file does not double the bank.
    (dedupeImportRows as any).mockResolvedValueOnce({
      results: [
        { key: 'q0', suggested_action: 'reuse', candidates: [{ id: 'bank-9', similarity: 0.95 }] },
        { key: 'q1', suggested_action: 'create', candidates: [] },
      ],
      summary: { create: 1, reuse: 1, review: 0 },
    });

    const questions = [question('q0', 'Which city is Shahjahanabad?'), question('q1', 'Who built Fatehpur Sikri?')];
    await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    const rows = (commitImport as any).mock.calls[0][0].rows;
    expect(rows[0]).toMatchObject({ action: 'reuse', existing_question_id: 'bank-9' });
    expect(rows[1]).toMatchObject({ action: 'create', existing_question_id: null });
  });

  it('ignores a review verdict, because nobody is reviewing', async () => {
    // Between the two thresholds the paste wizard asks a human. Neither of this
    // helper's callers has one, and treating "not sure" as reuse would silently
    // swap a question the teacher wrote for a different one.
    (dedupeImportRows as any).mockResolvedValueOnce({
      results: [{ key: 'q0', suggested_action: 'review', candidates: [{ id: 'bank-9', similarity: 0.8 }] }],
      summary: { create: 0, reuse: 0, review: 1 },
    });

    const questions = [question('q0', 'Which city is Shahjahanabad?')];
    await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    expect((commitImport as any).mock.calls[0][0].rows[0]).toMatchObject({
      action: 'create',
      existing_question_id: null,
    });
  });

  it('falls back to the study folder and the file name when the reply suggests none', async () => {
    const questions = [question('q0', 'Which city is Shahjahanabad?')];
    await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    expect(getFolderById).toHaveBeenCalledWith('folder-1');
    expect((commitImport as any).mock.calls[0][0]).toMatchObject({
      title: FILE.title,
      folderPath: ['Foundation', FILE.title],
      testKind: 'chapter',
      isPublished: true,
      createdFrom: 'study_upload',
    });
  });

  it('prefers the folder and title the reply asked for', async () => {
    const questions = [question('q0', 'Which city is Shahjahanabad?')];
    const result = parsed(questions, ['Foundation', 'History of Architecture']);
    result.test.title = 'History of Architecture';
    await buildChapterTest({ ...BASE, parsed: result, questions });

    expect((commitImport as any).mock.calls[0][0]).toMatchObject({
      title: 'History of Architecture',
      folderPath: ['Foundation', 'History of Architecture'],
    });
  });

  it('gates the chapter with the test it just built', async () => {
    const questions = [question('q0', 'Which city is Shahjahanabad?')];
    await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    expect(linkTestToStudyFile).toHaveBeenCalledWith({
      fileId: 'file-1',
      testId: 'test-1',
      passingPct: 70,
      createdBy: 'user-1',
    });
  });

  it('never reports serving more questions than the test holds', async () => {
    // commitImport returns 2 here. Asking for 20 of 2 would show the teacher a
    // number no student can ever be asked.
    const questions = [question('q0', 'Which city is Shahjahanabad?')];
    const result = await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });
    expect(result.serve).toBe(2);
    expect(result.question_count).toBe(2);
  });

  it('carries the source quote through the commit, which renumbers everything', async () => {
    const quote = 'Shahjahanabad was founded by Shah Jahan in 1639 and is now Old Delhi.';
    const questions = [question('q0', 'Which city is Shahjahanabad?', quote)];
    await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    const saved = (saveTestImportPayload as any).mock.calls[0][0];
    expect(saved.source).toBe('file_upload');
    expect(saved.sourceFileId).toBe('file-1');
    expect(saved.extras['whichcityisshahjahanabad']).toEqual({ source_quote: quote });
    expect(saved.promptMeta.folder_path).toEqual(['Foundation', FILE.title]);
  });

  it('still returns the test when archiving the payload fails', async () => {
    // The archive only decides whether the test can be edited later. Losing it
    // must not cost a test that has already been written and placed.
    (saveTestImportPayload as any).mockRejectedValueOnce(new Error('table is gone'));
    const questions = [question('q0', 'Which city is Shahjahanabad?')];
    const result = await buildChapterTest({ ...BASE, parsed: parsed(questions), questions });

    expect(result.test_id).toBe('test-1');
    expect(linkTestToStudyFile).toHaveBeenCalled();
  });
});
