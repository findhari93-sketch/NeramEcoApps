/**
 * processCollege: find, choose, store and save one college's cover photo and
 * logo, plus any empty facts Wikidata can fill.
 *
 * One function for every caller: the daily cron, the backfill script and the
 * Admin "Find automatically" button. Rules it never breaks:
 *   - a 'manual' college (staff set it) is skipped unless `force`
 *   - an existing hero_image_url or logo_url is kept unless `force`
 *   - Wikidata only fills columns that are empty
 *   - without the AI judge, only Wikimedia-curated images are used
 */
import { judgeCandidates } from './judge';
import { coverWebp, downloadImage, logoWebp } from './images';
import { dedupe, photoPath, rankCandidates, statusFor, trustedWithoutJudge } from './match';
import { commonsCategory, commonsFiles, findWikipediaArticle, getWikidataFacts, searchCommons, siteImages } from './sources';
import type { Candidate, CollegeForPhotos, EntityFacts, ProcessReport } from './types';

export const PHOTO_BUCKET = 'college-photos';

/** The parts of a Supabase client this file uses, so the script can pass its own. */
export interface PhotoDb {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
}

export interface ProcessOptions {
  /** Replace existing images and run on 'manual' colleges (Admin button). */
  force?: boolean;
  /** Find and choose, but upload and write nothing. */
  dryRun?: boolean;
  /** Researched candidates (backfill --manifest), tried before anything found online. */
  extra?: Candidate[];
  /** Ask the AI judge. Defaults to true; the judge itself falls back when blocked. */
  useJudge?: boolean;
}

/** The AI judge is blocked or failing; callers stop the batch and leave the queue as it is. */
export class JudgeUnavailableError extends Error {
  constructor(slug: string) {
    super(`photo judge unavailable (at ${slug}); stopping so the rest stay queued`);
    this.name = 'JudgeUnavailableError';
  }
}

const MAX_JUDGE_COVERS = 6;
const MAX_JUDGE_LOGOS = 4;

async function gather(college: CollegeForPhotos): Promise<{ entity: EntityFacts | null; covers: Candidate[]; logos: Candidate[]; notes: string[] }> {
  const notes: string[] = [];
  const all: Candidate[] = [];

  let entity: EntityFacts | null = null;
  const article = await findWikipediaArticle(college);
  if (article) {
    entity = await getWikidataFacts(article.wikidataId);
    if (entity) {
      notes.push(`wikidata ${entity.wikidataId} (${article.title})`);
      const files: { name: string; kind: Candidate['kind'] }[] = [];
      if (entity.imageFile) files.push({ name: entity.imageFile, kind: 'cover' });
      if (entity.logoFile) files.push({ name: entity.logoFile, kind: 'logo' });
      if (article.freeImage && article.freeImage !== entity.imageFile) files.push({ name: article.freeImage, kind: 'cover' });
      all.push(...(await commonsFiles(files, 'wikidata')));
      if (entity.commonsCategory) all.push(...(await commonsCategory(entity.commonsCategory)));
    } else {
      notes.push(`wikipedia match "${article.title}" rejected (not in India or no entity)`);
    }
  }

  all.push(...(await searchCommons(college)));
  all.push(...(await siteImages(college, college.website ? undefined : entity?.website)));

  const ranked = rankCandidates(dedupe(all));
  return {
    entity,
    covers: ranked.filter((c) => c.kind === 'cover'),
    logos: ranked.filter((c) => c.kind === 'logo'),
    notes,
  };
}

/** The columns Wikidata may fill, only where ours are empty. */
export function entityUpdates(college: CollegeForPhotos, e: EntityFacts | null): Record<string, unknown> {
  if (!e) return {};
  const u: Record<string, unknown> = {};
  if (!college.wikidata_id) u.wikidata_id = e.wikidataId;
  if (college.latitude == null && e.latitude != null && e.longitude != null) {
    u.latitude = e.latitude;
    u.longitude = e.longitude;
  }
  if (college.established_year == null && e.foundedYear) u.established_year = e.foundedYear;
  if (!college.website && e.website) u.website = e.website;
  if (!college.instagram_handle && e.instagram) u.instagram_handle = e.instagram;
  if (!college.facebook_url && e.facebook) u.facebook_url = e.facebook;
  if (!college.linkedin_url && e.linkedin) u.linkedin_url = e.linkedin;
  if (!college.youtube_channel_id && e.youtubeChannelId) u.youtube_channel_id = e.youtubeChannelId;
  const have = new Set([college.name, college.short_name, ...(college.aliases ?? [])].filter(Boolean).map((s) => s!.toLowerCase()));
  const extra = e.aliases.filter((a) => !have.has(a.toLowerCase()));
  if (extra.length > 0) u.aliases = [...(college.aliases ?? []), ...extra].slice(0, 12);
  return u;
}

async function upload(db: PhotoDb, path: string, data: Buffer): Promise<string> {
  const { error } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, data, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
}

/** Tries candidates in order until one survives download and the size/shape checks. */
async function firstUsable<T>(
  list: Candidate[],
  make: (buf: Buffer) => Promise<T>,
  notes: string[],
): Promise<{ cand: Candidate; out: T } | null> {
  for (const cand of list) {
    try {
      return { cand, out: await make(await downloadImage(cand.url)) };
    } catch (err) {
      notes.push(`skip ${cand.kind} ${cand.source}: ${(err as Error).message}`);
    }
  }
  return null;
}

export async function processCollege(db: PhotoDb, college: CollegeForPhotos, opts: ProcessOptions = {}): Promise<ProcessReport> {
  const report: ProcessReport = { slug: college.slug, status: 'skipped', filled: [], notes: [], candidates: { covers: 0, logos: 0 } };
  if (college.photo_status === 'manual' && !opts.force) {
    report.notes.push('manual: staff set these photos');
    return report;
  }

  const needCover = opts.force || !college.hero_image_url;
  const needLogo = opts.force || !college.logo_url;

  const found = await gather(college);
  report.notes.push(...found.notes);
  const extraCovers = (opts.extra ?? []).filter((c) => c.kind === 'cover');
  const extraLogos = (opts.extra ?? []).filter((c) => c.kind === 'logo');
  let covers = [...extraCovers, ...found.covers];
  let logos = [...extraLogos, ...found.logos];
  report.candidates = { covers: covers.length, logos: logos.length };

  // Choose: the AI judge orders what it accepts. Asked to run without it
  // (--no-ai), only curated images are used. If the judge is wanted but
  // unavailable (budget, daily cap, outage), nothing is written: the college
  // stays in the queue for the next run instead of being marked checked.
  const judgeCovers = needCover ? covers.slice(0, MAX_JUDGE_COVERS) : [];
  const judgeLogos = needLogo ? logos.slice(0, MAX_JUDGE_LOGOS) : [];
  if (opts.useJudge === false) {
    covers = covers.filter((c) => c.source === 'manifest' || trustedWithoutJudge(c));
    logos = logos.filter((c) => c.source === 'manifest' || trustedWithoutJudge(c));
    report.notes.push('judge off: curated images only');
  } else {
    const verdict = await judgeCandidates(college, judgeCovers, judgeLogos);
    if (!verdict) throw new JudgeUnavailableError(college.slug);
    covers = verdict.covers.map((i) => judgeCovers[i]);
    logos = verdict.logos.map((i) => judgeLogos[i]);
    report.notes.push(`judge accepted ${covers.length} cover(s), ${logos.length} logo(s)`);
  }

  const cover = needCover ? await firstUsable(covers, coverWebp, report.notes) : null;
  const logo = needLogo ? await firstUsable(logos, logoWebp, report.notes) : null;

  const update: Record<string, unknown> = { ...entityUpdates(college, found.entity) };
  report.filled = Object.keys(update);
  const now = Date.now();

  if (cover) {
    const url = opts.dryRun ? cover.cand.url : await upload(db, photoPath(college.id, college.slug, 'cover', now), cover.out.data);
    Object.assign(update, {
      hero_image_url: url,
      hero_image_credit: cover.cand.credit,
      hero_image_source_url: cover.cand.pageUrl,
      hero_image_license: cover.cand.license,
    });
    report.cover = { url, source: cover.cand.source, credit: cover.cand.credit, license: cover.cand.license };
  }
  if (logo) {
    const url = opts.dryRun ? logo.cand.url : await upload(db, photoPath(college.id, college.slug, 'logo', now), logo.out);
    Object.assign(update, { logo_url: url, logo_source_url: logo.cand.pageUrl });
    report.logo = { url, source: logo.cand.source };
  }

  const hasCover = !!(cover || college.hero_image_url);
  const hasLogo = !!(logo || college.logo_url);
  report.status = statusFor(hasCover, hasLogo);
  Object.assign(update, {
    photo_status: report.status,
    photo_checked_at: new Date(now).toISOString(),
    photo_attempts: (college.photo_attempts ?? 0) + 1,
  });

  if (!opts.dryRun) {
    const { error } = await db.from('colleges').update(update).eq('id', college.id);
    if (error) throw new Error(`save failed for ${college.slug}: ${error.message}`);
  }
  return report;
}
