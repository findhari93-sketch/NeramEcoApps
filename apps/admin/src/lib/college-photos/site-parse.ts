/**
 * Reads photo and logo candidates out of a college homepage's HTML.
 *
 * A small attribute scanner instead of a DOM parser: we only need <meta>,
 * <link> and <img> attributes, and this runs in a cron where pulling jsdom in
 * would cost more than the whole job. Pure, so it is unit-tested on fixtures.
 */
import { absoluteUrl } from './match';
import type { Candidate } from './types';

export type Attrs = Record<string, string>;

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseAttrs(inside: string): Attrs {
  const out: Attrs = {};
  let m: RegExpExecArray | null;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(inside))) {
    const key = m[1].toLowerCase();
    if (!(key in out)) out[key] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

export function findTags(html: string, tag: 'meta' | 'link' | 'img'): Attrs[] {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
  const out: Attrs[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(parseAttrs(m[1]));
  return out;
}

const COVER_HINT = /campus|building|college|banner|slider|slide|hero|about|aerial|infra|block|facade|front|view|gate/i;
const COVER_AVOID = /logo|icon|favicon|sprite|avatar|profile|staff|faculty|principal|chairman|director|award|news|event|placement|student|team|whatsapp|facebook|instagram|twitter|youtube|linkedin|google|play|app-?store|arrow|loader|loading|spinner|pixel|tracking|badge|ad[s_-]|advert|\.gif(\?|$)|\.svg(\?|$)/i;
const LOGO_HINT = /logo|emblem|crest|seal/i;

function imgSrc(a: Attrs): string | undefined {
  return a['src'] || a['data-src'] || a['data-lazy-src'] || a['data-original'] || firstSrcset(a['srcset'] || a['data-srcset']);
}

/** The largest entry of a srcset (by its w descriptor), or the first one. */
function firstSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  const parts = srcset.split(',').map((p) => p.trim().split(/\s+/));
  let best: { url: string; w: number } | null = null;
  for (const [url, d] of parts) {
    const w = d?.endsWith('w') ? Number(d.slice(0, -1)) : 0;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}

/**
 * Cover and logo candidates from one page. `pageUrl` is the page's final URL
 * (after redirects), used to resolve relative paths and as the credit link.
 */
export function siteCandidates(html: string, pageUrl: string, collegeName: string): Candidate[] {
  const out: Candidate[] = [];
  const credit = collegeName;
  const add = (kind: Candidate['kind'], raw: string | undefined, title?: string) => {
    const url = absoluteUrl(raw, pageUrl);
    if (!url) return;
    out.push({ kind, url, pageUrl, credit, license: 'official-site', source: 'site', title });
  };

  for (const m of findTags(html, 'meta')) {
    const key = (m['property'] || m['name'] || m['itemprop'] || '').toLowerCase();
    if (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url' || key === 'twitter:image' || key === 'image') {
      // An og:image is often the logo; the judge sorts that out, but use the hint when the name says so.
      add(LOGO_HINT.test(m['content'] || '') ? 'logo' : 'cover', m['content'], key);
    }
    if (key === 'og:logo') add('logo', m['content'], key);
  }

  for (const l of findTags(html, 'link')) {
    const rel = (l['rel'] || '').toLowerCase();
    if (rel.includes('apple-touch-icon')) add('logo', l['href'], 'apple-touch-icon');
    else if (rel.split(/\s+/).includes('icon')) {
      const size = Number((l['sizes'] || '').split('x')[0]) || 0;
      if (size >= 96 || /\.svg(\?|$)/i.test(l['href'] || '')) add('logo', l['href'], 'icon');
    }
  }

  let covers = 0;
  let logos = 0;
  for (const img of findTags(html, 'img')) {
    const src = imgSrc(img);
    if (!src) continue;
    const label = `${src} ${img['alt'] || ''} ${img['class'] || ''} ${img['id'] || ''} ${img['title'] || ''}`;
    if (LOGO_HINT.test(label) && logos < 3) {
      add('logo', src, img['alt']);
      logos++;
      continue;
    }
    const w = Number(img['width']) || 0;
    if (covers < 6 && !COVER_AVOID.test(label) && (COVER_HINT.test(label) || w >= 900)) {
      add('cover', src, img['alt']);
      covers++;
    }
  }
  return out;
}

/** Same-site links to pages that usually carry campus photos. */
export function campusPageLinks(html: string, pageUrl: string, max = 2): string[] {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const host = new URL(pageUrl).host;
  const want = /\b(campus|infrastructure|gallery|about[- ]?us|about the college|facilities|virtual tour)\b/i;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < max) {
    const text = m[2].replace(/<[^>]+>/g, ' ');
    if (!want.test(text) && !want.test(m[1])) continue;
    const url = absoluteUrl(m[1], pageUrl);
    if (!url) continue;
    try {
      if (new URL(url).host !== host) continue;
    } catch {
      continue;
    }
    if (!out.includes(url) && url !== pageUrl) out.push(url);
  }
  return out;
}
