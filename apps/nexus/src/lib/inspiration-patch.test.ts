import { describe, expect, it } from 'vitest';
import { parseExemplarInput, parseItemPatch } from './inspiration-patch';

/** The HTTP status an ApiError carries, or undefined when nothing was thrown. */
function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { status?: number }).status;
  }
  return undefined;
}

describe('parseItemPatch', () => {
  it('accepts curation, feature and text edits and trims empties to null', () => {
    expect(parseItemPatch({ curation: 'hidden', is_featured: true, title_override: '  ', brief_override: ' A bag ' }, 'submission_original')).toEqual({
      patch: { curation: 'hidden', is_featured: true, title_override: null, brief_override: 'A bag' },
      hideAllByAuthor: false,
    });
  });

  it('rejects bad values with a 400', () => {
    expect(statusOf(() => parseItemPatch({ curation: 'published' }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ is_featured: 'yes' }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ title_override: 'x'.repeat(121) }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({}, 'exemplar'))).toBe(400);
  });

  it('lets only exemplars carry their own types, exams and years', () => {
    expect(statusOf(() => parseItemPatch({ type_slugs: ['still_life'] }, 'submission_original'))).toBe(400);
    expect(parseItemPatch({ type_slugs: ['still_life'], exam_types: ['NATA'], paper_years: [2024] }, 'exemplar').patch).toEqual({
      type_slugs: ['still_life'], exam_types: ['NATA'], paper_years: [2024],
    });
    expect(statusOf(() => parseItemPatch({ type_slugs: ['not_a_type'] }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ paper_years: [1990] }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ type_slugs: ['constructor'] }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ type_slugs: ['__proto__'] }, 'exemplar'))).toBe(400);
    expect(statusOf(() => parseItemPatch({ type_slugs: ['toString'] }, 'exemplar'))).toBe(400);
  });

  it('allows hide-all on its own', () => {
    expect(parseItemPatch({ hide_all_by_author: true }, 'submission_original')).toEqual({ patch: {}, hideAllByAuthor: true });
  });
});

describe('parseExemplarInput', () => {
  const IMAGE = 'https://db.neramclasses.com/storage/v1/object/public/drawing-references/x.png';
  const ok = { image_url: IMAGE, title: 'Bag and hat', brief: '', type_slugs: ['3d_composition'], exam_types: ['NATA'], paper_years: [2025] };

  it('accepts a complete exemplar', () => {
    expect(parseExemplarInput(ok)).toEqual({ image_url: IMAGE, title: 'Bag and hat', brief: null, type_slugs: ['3d_composition'], exam_types: ['NATA'], paper_years: [2025] });
  });

  it('needs an https image, a type, and a title or a brief', () => {
    expect(statusOf(() => parseExemplarInput({ ...ok, image_url: IMAGE.replace('https:', 'http:') }))).toBe(400);
    expect(statusOf(() => parseExemplarInput({ ...ok, type_slugs: [] }))).toBe(400);
    expect(statusOf(() => parseExemplarInput({ ...ok, title: '', brief: '' }))).toBe(400);
  });

  it('refuses an image that is not in project storage', () => {
    for (const image_url of [
      'https://example.com/a.jpg',
      'https://placehold.co/600x800.png',
      'https://db.neramclasses.com.evil.io/storage/v1/object/public/drawing-references/x.png',
      'https://user:pw@db.neramclasses.com/storage/v1/object/public/drawing-references/x.png',
      'https://db.neramclasses.com/rest/v1/users',
    ]) {
      let message = '';
      try {
        parseExemplarInput({ ...ok, image_url });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(statusOf(() => parseExemplarInput({ ...ok, image_url }))).toBe(400);
      expect(message).toBe('Upload the drawing first.');
    }
  });
});
