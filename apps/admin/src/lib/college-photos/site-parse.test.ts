import { describe, expect, it } from 'vitest';
import { campusPageLinks, parseAttrs, siteCandidates } from './site-parse';

const HTML = `
<html><head>
  <meta property="og:image" content="/uploads/campus-front.jpg">
  <meta name="twitter:image" content='https://cdn.abc.edu.in/hero.jpg'>
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="icon" href="/favicon.ico">
  <link rel="icon" sizes="192x192" href="/icon-192.png">
</head><body>
  <header><img src="/images/abc-logo.png" alt="ABC College logo"></header>
  <img data-src="/images/main-building.jpg" alt="Main building">
  <img src="/images/principal.jpg" alt="Our Principal">
  <img src="/images/admission-poster.gif">
  <img srcset="/s/a-600.jpg 600w, /s/a-1600.jpg 1600w" alt="Campus aerial view">
  <a href="/about-us">About Us</a>
  <a href="https://other.com/campus">Campus elsewhere</a>
  <a href="/gallery"><span>Photo Gallery</span></a>
</body></html>`;

describe('parseAttrs', () => {
  it('reads quoted, single-quoted and bare attributes', () => {
    expect(parseAttrs(` a="1" b='2' c=3 d`)).toEqual({ a: '1', b: '2', c: '3', d: '' });
  });
});

describe('siteCandidates', () => {
  const cands = siteCandidates(HTML, 'https://abc.edu.in/', 'ABC College');
  const urls = (kind: string) => cands.filter((c) => c.kind === kind).map((c) => c.url);

  it('finds covers from og/twitter images, campus pictures and srcset', () => {
    expect(urls('cover')).toEqual(
      expect.arrayContaining([
        'https://abc.edu.in/uploads/campus-front.jpg',
        'https://cdn.abc.edu.in/hero.jpg',
        'https://abc.edu.in/images/main-building.jpg',
        'https://abc.edu.in/s/a-1600.jpg',
      ]),
    );
  });

  it('skips people, posters and gifs as covers', () => {
    expect(urls('cover').some((u) => /principal|poster/.test(u))).toBe(false);
  });

  it('finds logos from the header image and large icons, not the favicon', () => {
    expect(urls('logo')).toEqual(
      expect.arrayContaining(['https://abc.edu.in/images/abc-logo.png', 'https://abc.edu.in/apple-touch-icon.png', 'https://abc.edu.in/icon-192.png']),
    );
    expect(urls('logo')).not.toContain('https://abc.edu.in/favicon.ico');
  });

  it('marks everything as the college site, credited to the college', () => {
    expect(cands.every((c) => c.source === 'site' && c.license === 'official-site' && c.credit === 'ABC College')).toBe(true);
  });
});

describe('campusPageLinks', () => {
  it('follows same-site about and gallery links only', () => {
    expect(campusPageLinks(HTML, 'https://abc.edu.in/', 3)).toEqual(['https://abc.edu.in/about-us', 'https://abc.edu.in/gallery']);
  });
});
