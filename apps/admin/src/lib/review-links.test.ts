import { describe, expect, test } from 'vitest';
import { validateReviewLink } from './review-links';

describe('validateReviewLink', () => {
  test('accepts each platform on its own domain', () => {
    expect(validateReviewLink('google', 'https://g.page/r/CabcXYZ/review')).toEqual({ url: 'https://g.page/r/CabcXYZ/review' });
    expect(validateReviewLink('google', 'https://search.google.com/local/writereview?placeid=ChIJ123')).toHaveProperty('url');
    expect(validateReviewLink('justdial', 'https://www.justdial.com/Chennai/Neram-Classes/123')).toHaveProperty('url');
    expect(validateReviewLink('sulekha', 'https://www.sulekha.com/neram-classes-chennai')).toHaveProperty('url');
  });

  test('refuses another domain, http and junk', () => {
    expect(validateReviewLink('justdial', 'https://www.sulekha.com/x')).toHaveProperty('error');
    expect(validateReviewLink('google', 'https://evil-google.com.example/r')).toHaveProperty('error');
    expect(validateReviewLink('google', 'http://g.page/r/abc/review')).toHaveProperty('error');
    expect(validateReviewLink('sulekha', 'sulekha neram')).toHaveProperty('error');
  });

  test('an empty value clears the link', () => {
    expect(validateReviewLink('google', '  ')).toEqual({ url: null });
    expect(validateReviewLink('google', null)).toEqual({ url: null });
  });
});
