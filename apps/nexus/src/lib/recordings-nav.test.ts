import { describe, it, expect } from 'vitest';
import {
  parseRecordingsFrom,
  recordingsHref,
  recordingsBackHref,
  recordingsBackLabel,
  checkpointsHref,
  chapterSetupHref,
} from './recordings-nav';

/**
 * Where every recordings screen goes, and where it comes back to.
 *
 * The bug this exists for: "Edit" on a Tamil recording opened the checkpoint
 * editor, whose Back button was hard-coded to the Study Materials root. The
 * teacher lost the chapter, the recordings dialog and the language they were
 * working on in one press. Every link is built here instead, from values that
 * cannot point anywhere outside these screens.
 */

describe('parseRecordingsFrom', () => {
  it('recognises the library and treats everything else as the chapter', () => {
    expect(parseRecordingsFrom('library')).toBe('library');
    expect(parseRecordingsFrom('chapter')).toBe('chapter');
    expect(parseRecordingsFrom(null)).toBe('chapter');
    expect(parseRecordingsFrom(undefined)).toBe('chapter');
    expect(parseRecordingsFrom('//evil.example')).toBe('chapter');
    expect(parseRecordingsFrom(['library'])).toBe('chapter');
  });
});

describe('recordingsHref', () => {
  it('points at the chapter recordings page', () => {
    expect(recordingsHref({ fileId: 'f1' })).toBe('/teacher/study-materials/f1/recordings');
  });

  it('carries the language tab', () => {
    expect(recordingsHref({ fileId: 'f1', lang: 'ta' })).toBe(
      '/teacher/study-materials/f1/recordings?lang=ta',
    );
  });

  it('carries the origin only when it is the library, which is the only one that changes Back', () => {
    expect(recordingsHref({ fileId: 'f1', lang: 'ta', from: 'library' })).toBe(
      '/teacher/study-materials/f1/recordings?lang=ta&from=library',
    );
    expect(recordingsHref({ fileId: 'f1', from: 'chapter' })).toBe(
      '/teacher/study-materials/f1/recordings',
    );
  });

  it('drops a language that is not a language code instead of passing it through', () => {
    expect(recordingsHref({ fileId: 'f1', lang: 'ta&from=x' })).toBe(
      '/teacher/study-materials/f1/recordings',
    );
  });

  it('encodes the chapter id so a stray slash cannot change the route', () => {
    expect(recordingsHref({ fileId: 'a/b' })).toBe('/teacher/study-materials/a%2Fb/recordings');
  });
});

describe('recordingsBackHref', () => {
  it('returns to the Setup tab of the chapter by default', () => {
    expect(recordingsBackHref({ fileId: 'f1', folderId: 'd1' })).toBe(
      '/teacher/study-materials/f1?tab=setup',
    );
  });

  it('returns to the same library folder when the page was opened from the library', () => {
    expect(recordingsBackHref({ fileId: 'f1', folderId: 'd1', from: 'library' })).toBe(
      '/teacher/study-materials?folder=d1',
    );
  });

  it('falls back to the library root while the folder is still unknown', () => {
    expect(recordingsBackHref({ fileId: 'f1', folderId: null, from: 'library' })).toBe(
      '/teacher/study-materials',
    );
  });
});

describe('recordingsBackLabel', () => {
  it('names the place Back goes to', () => {
    expect(recordingsBackLabel('chapter')).toBe('Back to chapter');
    expect(recordingsBackLabel('library')).toBe('Back to Study Materials');
  });
});

describe('checkpointsHref', () => {
  it('nests the editor under the recording it belongs to', () => {
    expect(checkpointsHref({ fileId: 'f1', trackId: 't1' })).toBe(
      '/teacher/study-materials/f1/recordings/t1/checkpoints',
    );
  });

  it('keeps the library origin, so Back from the recordings page still reaches the folder', () => {
    expect(checkpointsHref({ fileId: 'f1', trackId: 't1', from: 'library' })).toBe(
      '/teacher/study-materials/f1/recordings/t1/checkpoints?from=library',
    );
  });
});

describe('chapterSetupHref', () => {
  it('opens the chapter on its Setup tab', () => {
    expect(chapterSetupHref('f1')).toBe('/teacher/study-materials/f1?tab=setup');
  });
});
