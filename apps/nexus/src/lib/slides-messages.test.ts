import { describe, it, expect } from 'vitest';
import { SLIDES_MESSAGE_CODES, slidesMessage, slidesNeedFix } from './slides-messages';

describe('slidesMessage', () => {
  it('says something for every code', () => {
    for (const code of SLIDES_MESSAGE_CODES) {
      expect(slidesMessage(code).length).toBeGreaterThan(20);
    }
  });

  it('never uses an em dash or a double dash (content rule)', () => {
    for (const code of SLIDES_MESSAGE_CODES) {
      const text = slidesMessage(code, { name: 'Chapter 1.pptx' });
      expect(text).not.toContain('—');
      expect(text).not.toContain('--');
    }
  });

  it('names the file when it is known', () => {
    expect(slidesMessage('SLIDES_IN_ONEDRIVE', { name: 'History.pptx' })).toContain('"History.pptx"');
    expect(slidesMessage('NOT_A_PRESENTATION', { name: 'notes.pdf' })).toContain('"notes.pdf"');
  });

  it('tells the teacher students keep the last version when the source goes missing', () => {
    expect(slidesMessage('SOURCE_MISSING')).toContain('Students still see the last version');
  });
});

describe('slidesNeedFix', () => {
  it('flags problems a teacher can act on', () => {
    expect(slidesNeedFix('SOURCE_MISSING')).toBe(true);
    expect(slidesNeedFix('TOO_LARGE')).toBe(true);
    expect(slidesNeedFix('RENDITION_UNAVAILABLE')).toBe(true);
  });

  it('does not flag a busy SharePoint or no problem', () => {
    expect(slidesNeedFix('GRAPH_UNAVAILABLE')).toBe(false);
    expect(slidesNeedFix(null)).toBe(false);
    expect(slidesNeedFix(undefined)).toBe(false);
  });
});
