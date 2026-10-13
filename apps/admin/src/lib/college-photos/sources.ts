/**
 * Where the photo finder looks, in order of trust:
 *   1. Wikipedia → Wikidata: the college's own entity, its image (P18), logo
 *      (P154), Commons category (P373), and facts we can fill (coordinates,
 *      founding year, website, social profiles, other names).
 *   2. Wikimedia Commons: free-licence photos with the college's name.
 *   3. The college's own website: og:image, logo, campus pictures.
 *
 * Wikimedia asks every client for a User-Agent with contact details, and is
 * friendly to light traffic like this (a handful of requests per college).
 */
import {
  campusPageLinks,
  siteCandidates,
} from './site-parse';
import {
  inIndia,
  isAllowedLicense,
  isSameCollege,
  normalizeWebsite,
  plainCredit,
  yearFromWikidataTime,
} from './match';
import type { Candidate, CollegeForPhotos, EntityFacts } from './types';

export const USER_AGENT = 'NeramClassesBot/1.0 (https://neramclasses.com; info@neramclasses.com)';
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 NeramClassesBot/1.0';
const MAX_HTML_BYTES = 1_500_000;

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 12_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T = any>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const q = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

// ── Wikipedia + Wikidata ──────────────────────────────────────────────────

interface WikiMatch {
  title: string;
  wikidataId: string;
  freeImage?: string;
}

/** Finds the college's English Wikipedia article, only when it clearly is the same college. */
export async function findWikipediaArticle(college: CollegeForPhotos): Promise<WikiMatch | null> {
  const queries = [`${college.name} ${college.city ?? ''}`.trim()];
  if (college.short_name && college.short_name !== college.name) queries.push(`${college.short_name} ${college.city ?? ''}`.trim());

  for (const query of queries) {
    const search = await getJson(
      `https://en.wikipedia.org/w/api.php?${q({ action: 'query', list: 'search', srsearch: query, srlimit: 5, format: 'json' })}`,
    );
    const titles: string[] = (search?.query?.search ?? []).map((s: any) => s.title);
    if (titles.length === 0) continue;

    const props = await getJson(
      `https://en.wikipedia.org/w/api.php?${q({
        action: 'query',
        titles: titles.join('|'),
        prop: 'pageprops',
        redirects: 1,
        format: 'json',
      })}`,
    );
    const pages: any[] = Object.values(props?.query?.pages ?? {});
    // Keep the search order: the first good match wins.
    for (const title of titles) {
      const p = pages.find((x) => x.title === title);
      const pp = p?.pageprops;
      if (!pp?.wikibase_item) continue;
      if (!isSameCollege(college, p.title, pp['wikibase-shortdesc'] ?? '')) continue;
      return { title: p.title, wikidataId: pp.wikibase_item, freeImage: pp.page_image_free };
    }
  }
  return null;
}

const claimValues = (claims: any, prop: string): any[] =>
  (claims?.[prop] ?? [])
    .filter((c: any) => c.rank !== 'deprecated')
    .map((c: any) => c.mainsnak?.datavalue?.value)
    .filter((v: any) => v !== undefined && v !== null);

/** Reads the facts and image file names off a Wikidata entity. */
export async function getWikidataFacts(qid: string): Promise<EntityFacts | null> {
  const data = await getJson(
    `https://www.wikidata.org/w/api.php?${q({
      action: 'wbgetentities',
      ids: qid,
      props: 'claims|aliases|labels',
      languages: 'en',
      format: 'json',
    })}`,
  );
  const e = data?.entities?.[qid];
  if (!e?.claims) return null;
  const c = e.claims;

  const facts: EntityFacts = {
    wikidataId: qid,
    aliases: (e.aliases?.en ?? []).map((a: any) => String(a.value)).filter((a: string) => a.length <= 80),
  };

  const country = claimValues(c, 'P17').map((v) => v.id);
  const coord = claimValues(c, 'P625')[0];
  if (coord && typeof coord.latitude === 'number' && inIndia(coord.latitude, coord.longitude)) {
    facts.latitude = Math.round(coord.latitude * 1e6) / 1e6;
    facts.longitude = Math.round(coord.longitude * 1e6) / 1e6;
  }
  // Not in India: not our college, whatever the title said.
  if (country.length > 0 && !country.includes('Q668')) return null;

  facts.foundedYear = yearFromWikidataTime(claimValues(c, 'P571')[0]);
  const site = claimValues(c, 'P856')[0];
  if (typeof site === 'string') facts.website = normalizeWebsite(site) ?? undefined;
  const insta = claimValues(c, 'P2003')[0];
  if (typeof insta === 'string') facts.instagram = insta;
  const fb = claimValues(c, 'P2013')[0];
  if (typeof fb === 'string') facts.facebook = `https://www.facebook.com/${fb}`;
  const li = claimValues(c, 'P4264')[0];
  if (typeof li === 'string') facts.linkedin = `https://www.linkedin.com/company/${li}`;
  const yt = claimValues(c, 'P2397')[0];
  if (typeof yt === 'string') facts.youtubeChannelId = yt;
  const cat = claimValues(c, 'P373')[0];
  if (typeof cat === 'string') facts.commonsCategory = cat;
  const img = claimValues(c, 'P18')[0];
  if (typeof img === 'string') facts.imageFile = img;
  const logo = claimValues(c, 'P154')[0];
  if (typeof logo === 'string') facts.logoFile = logo;
  return facts;
}

// ── Wikimedia Commons ─────────────────────────────────────────────────────

function commonsCandidate(page: any, kind: Candidate['kind'], source: Candidate['source']): Candidate | null {
  const ii = page?.imageinfo?.[0];
  if (!ii?.url) return null;
  const mime = String(ii.mime || '');
  const isImage = /^image\/(jpeg|png|webp)$/.test(mime) || (kind === 'logo' && mime === 'image/svg+xml');
  if (!isImage) return null;
  const meta = ii.extmetadata ?? {};
  const license = meta.LicenseShortName?.value as string | undefined;
  // Logos are usually trademarks rather than free works ("Non-free", "PD-textlogo");
  // they are fine to show as the college's own mark, so only covers need a free licence.
  if (kind === 'cover' && !isAllowedLicense(license)) return null;
  return {
    kind,
    url: ii.url,
    thumbUrl: ii.thumburl,
    pageUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    credit: kind === 'cover' ? plainCredit(meta.Artist?.value) : 'Wikimedia Commons',
    license: license || (kind === 'logo' ? 'logo' : 'unknown'),
    width: ii.width,
    height: ii.height,
    source,
    title: page.title,
  };
}

const IMAGEINFO = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
  iiextmetadatafilter: 'LicenseShortName|Artist',
  iiurlwidth: 800,
};

/** Candidates for specific Commons files (Wikidata's P18 and P154). */
export async function commonsFiles(
  files: { name: string; kind: Candidate['kind'] }[],
  source: Candidate['source'],
): Promise<Candidate[]> {
  if (files.length === 0) return [];
  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?${q({
      action: 'query',
      titles: files.map((f) => `File:${f.name}`).join('|'),
      format: 'json',
      ...IMAGEINFO,
    })}`,
  );
  const pages: any[] = Object.values(data?.query?.pages ?? {});
  const norm = (s: string) => s.replace(/^File:/, '').replace(/_/g, ' ').toLowerCase();
  return files
    .map((f) => {
      const page = pages.find((p) => norm(p.title) === norm(f.name));
      return page ? commonsCandidate(page, f.kind, source) : null;
    })
    .filter((c): c is Candidate => !!c);
}

/** Photos in the college's own Commons category (Wikidata P373). */
export async function commonsCategory(category: string, limit = 15): Promise<Candidate[]> {
  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?${q({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: `Category:${category}`,
      gcmtype: 'file',
      gcmlimit: limit,
      format: 'json',
      ...IMAGEINFO,
    })}`,
  );
  return Object.values(data?.query?.pages ?? {})
    .map((p) => commonsCandidate(p, 'cover', 'commons'))
    .filter((c): c is Candidate => !!c);
}

/**
 * Commons full-text search on the exact college name. Quoting the name keeps
 * results to files whose page mentions it; `filetype:bitmap` drops the PDFs
 * and scans that otherwise flood the results.
 */
export async function searchCommons(college: CollegeForPhotos, limit = 10): Promise<Candidate[]> {
  const queries = [`"${college.name}" filetype:bitmap`];
  if (college.short_name && college.city) queries.push(`"${college.short_name}" "${college.city}" filetype:bitmap`);
  const out: Candidate[] = [];
  for (const query of queries) {
    const data = await getJson(
      `https://commons.wikimedia.org/w/api.php?${q({
        action: 'query',
        generator: 'search',
        gsrnamespace: 6,
        gsrsearch: query,
        gsrlimit: limit,
        format: 'json',
        ...IMAGEINFO,
      })}`,
    );
    for (const p of Object.values(data?.query?.pages ?? {})) {
      const c = commonsCandidate(p, 'cover', 'commons');
      if (c) out.push(c);
    }
    if (out.length >= 4) break;
  }
  return out;
}

// ── The college's own website ─────────────────────────────────────────────

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      timeoutMs: 12_000,
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    return { html: new TextDecoder('utf-8').decode(buf), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/** Homepage plus up to two campus/about/gallery pages it links to. */
export async function siteImages(college: CollegeForPhotos, websiteOverride?: string): Promise<Candidate[]> {
  const site = normalizeWebsite(websiteOverride ?? college.website);
  if (!site) return [];
  const home = await fetchHtml(site);
  if (!home) return [];
  const out = siteCandidates(home.html, home.finalUrl, college.name);
  for (const link of campusPageLinks(home.html, home.finalUrl, 2)) {
    const page = await fetchHtml(link);
    if (page) out.push(...siteCandidates(page.html, page.finalUrl, college.name).filter((c) => c.kind === 'cover'));
  }
  return out;
}
