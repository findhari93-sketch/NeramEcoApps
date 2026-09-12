import { describe, it, expect } from 'vitest';
import {
  SLIDES_OPEN_FAILED,
  SLIDES_SLOW_NOTICE,
  slidesUnavailableText,
  slidesViewFromResponse,
} from './slides-view';

describe('slidesViewFromResponse', () => {
  it('opens the reader on a ready deck', () => {
    const body = { slides: { status: 'ready', url: 'https://db.neramclasses.com/storage/v1/object/sign/x.pdf', expires_in: 3600 } };
    expect(slidesViewFromResponse(true, body)).toEqual({
      phase: 'ready',
      url: 'https://db.neramclasses.com/storage/v1/object/sign/x.pdf',
    });
  });

  it('says the deck was removed when the chapter has none any more', () => {
    expect(slidesViewFromResponse(true, { slides: null })).toEqual({ phase: 'unavailable', reason: 'removed' });
  });

  it('says the slides cannot be shown when nothing can be served', () => {
    expect(slidesViewFromResponse(true, { slides: { status: 'unavailable', code: 'RENDITION_UNAVAILABLE' } })).toEqual({
      phase: 'unavailable',
      reason: 'problem',
    });
    expect(slidesViewFromResponse(true, { slides: { status: 'ready' } })).toEqual({
      phase: 'unavailable',
      reason: 'problem',
    });
  });

  it("passes on the server's reason for a refusal", () => {
    expect(slidesViewFromResponse(false, { error: 'These slides are view only.' })).toEqual({
      phase: 'error',
      message: 'These slides are view only.',
    });
  });

  it('falls back to a plain message when there is no readable answer', () => {
    expect(slidesViewFromResponse(false, {})).toEqual({ phase: 'error', message: SLIDES_OPEN_FAILED });
    expect(slidesViewFromResponse(true, null)).toEqual({ phase: 'error', message: SLIDES_OPEN_FAILED });
    expect(slidesViewFromResponse(false, null)).toEqual({ phase: 'error', message: SLIDES_OPEN_FAILED });
  });
});

describe('student wording', () => {
  const texts = [
    SLIDES_SLOW_NOTICE,
    SLIDES_OPEN_FAILED,
    slidesUnavailableText('problem'),
    slidesUnavailableText('removed'),
  ];

  it('always points back to the PDF when slides cannot be shown', () => {
    expect(slidesUnavailableText('problem')).toMatch(/PDF/);
    expect(slidesUnavailableText('removed')).toMatch(/PDF/);
  });

  it('uses no em dash or double dash', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/—|--/);
    }
  });
});
