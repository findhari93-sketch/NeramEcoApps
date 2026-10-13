/**
 * Reads the SEO-relevant parts of a page's server-rendered HTML with regexes
 * (no DOM library on the server). Our pages are rendered by Next.js, so the
 * head tags, H1, JSON-LD and body copy are all in the first response.
 */

export interface PageSnapshot {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1Count: number;
  jsonldTypes: string[];
  jsonldErrors: number;
  wordCount: number;
  /** A short answer paragraph (10 to 60 words) right under the H1. */
  answerFirst: boolean;
  /** Same-host links, absolute, without hash or query. */
  internalLinks: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Attributes of one tag, lower-cased names. */
export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

const stripTags = (html: string) =>
  decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

const countWords = (text: string) => (text ? text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0);

/** Every @type in a JSON-LD value, including inside @graph and nested objects. */
export function collectTypes(value: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 12 || value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const v of value) collectTypes(v, out, depth + 1);
    return out;
  }
  const obj = value as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string') out.add(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
  for (const [k, v] of Object.entries(obj)) if (k !== '@type') collectTypes(v, out, depth + 1);
  return out;
}

export function parseHtml(html: string, pageUrl: string): PageSnapshot {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html;

  const rawTitle = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle !== undefined ? decodeEntities(rawTitle).replace(/\s+/g, ' ').trim() || null : null;

  let metaDescription: string | null = null;
  let robotsMeta: string | null = null;
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const name = (a.name || '').toLowerCase();
    if (name === 'description' && metaDescription === null) metaDescription = (a.content ?? '').trim();
    if (name === 'robots' && robotsMeta === null) robotsMeta = (a.content ?? '').trim().toLowerCase();
  }

  let canonical: string | null = null;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.rel || '').toLowerCase().split(/\s+/).includes('canonical') && a.href) {
      try {
        canonical = new URL(a.href, pageUrl).toString();
      } catch {
        canonical = a.href;
      }
      break;
    }
  }

  const types = new Set<string>();
  let jsonldErrors = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectTypes(JSON.parse(m[1].trim()), types);
    } catch {
      jsonldErrors += 1;
    }
  }

  const body = html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html;
  const main = body.match(/<main\b[\s\S]*<\/main>/i)?.[0] ?? body;
  const h1Count = (body.match(/<h1[\s>]/gi) ?? []).length;
  const wordCount = countWords(stripTags(main));

  // The first non-empty paragraph after the H1.
  let answerFirst = false;
  const afterH1 = body.split(/<\/h1>/i)[1];
  if (afterH1) {
    for (const p of afterH1.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      const words = countWords(stripTags(p[1]));
      if (words === 0) continue;
      answerFirst = words >= 10 && words <= 60;
      break;
    }
  }

  const host = new URL(pageUrl).host;
  const links = new Set<string>();
  for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = attrs(m[0]).href;
    if (!href || /^(mailto:|tel:|javascript:|#|data:)/i.test(href)) continue;
    try {
      const u = new URL(href, pageUrl);
      if (u.host !== host || !/^https?:$/.test(u.protocol)) continue;
      // Cloudflare's email obfuscation rewrites mailto: links to /cdn-cgi/l/email-protection, which 404s by design.
      if (u.pathname.startsWith('/cdn-cgi/')) continue;
      u.hash = '';
      u.search = '';
      links.add(u.toString());
    } catch {
      /* ignore bad hrefs */
    }
  }

  return {
    title,
    metaDescription,
    canonical,
    robotsMeta,
    h1Count,
    jsonldTypes: [...types].sort(),
    jsonldErrors,
    wordCount,
    answerFirst,
    internalLinks: [...links],
  };
}
