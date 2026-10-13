/**
 * Finds cover photos and logos for colleges, the same way the nightly cron
 * does, for many colleges at once. Also imports researched photos.
 *
 * From apps/admin:
 *   npx tsx scripts/college-photos-backfill.ts --env staging --dry-run --limit 5
 *   npx tsx scripts/college-photos-backfill.ts --env staging
 *   npx tsx scripts/college-photos-backfill.ts --env staging --slug psg-iap
 *   npx tsx scripts/college-photos-backfill.ts --env staging --manifest ../../tmp/manifest.json
 *   npx tsx scripts/college-photos-backfill.ts --env prod        (only when asked)
 *
 * --manifest: JSON array of { slug, cover_url?, logo_url?, source_page?, credit?, license? }
 *   from research. Those images are tried first for each listed college, and
 *   the college is processed even if it was already checked.
 * --no-ai: skip the Gemini judge (curated Wikimedia images only).
 * Writes a JSON report next to the manifest, or to college-photos-report.json.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { arg, flag, useEnv } from './college-env';

interface ManifestEntry {
  slug: string;
  cover_url?: string | null;
  logo_url?: string | null;
  source_page?: string | null;
  credit?: string | null;
  license?: string | null;
}

async function main() {
  const env = useEnv();
  const { getSupabaseAdminClient } = await import('@neram/database');
  const { processCollege, JudgeUnavailableError } = await import('../src/lib/college-photos/apply');
  const { isDue } = await import('../src/lib/college-photos/match');
  const { COLLEGE_PHOTO_COLUMNS } = await import('../src/lib/college-photos/types');
  type Candidate = import('../src/lib/college-photos/types').Candidate;

  const db = getSupabaseAdminClient() as any;

  const dryRun = flag('dry-run');
  const limit = Number(arg('limit')) || Infinity;
  const slug = arg('slug');
  const manifestPath = arg('manifest');
  const manifest: ManifestEntry[] = manifestPath ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
  const bySlug = new Map(manifest.map((m) => [m.slug, m]));

  let q = db.from('colleges').select(COLLEGE_PHOTO_COLUMNS).eq('status', 'active').order('name');
  if (slug) q = q.eq('slug', slug);
  else if (manifest.length) q = q.in('slug', [...bySlug.keys()]);
  const { data, error } = await q.limit(1000);
  if (error) throw error;

  const colleges = (data as any[]).filter((c) => slug || bySlug.has(c.slug) || isDue(c)).slice(0, limit);
  console.log(`${dryRun ? 'DRY RUN: ' : ''}${colleges.length} college(s) to process on ${env}\n`);

  const reports: any[] = [];
  for (const [i, college] of colleges.entries()) {
    const m = bySlug.get(college.slug);
    const extra: Candidate[] = [];
    if (m?.cover_url) {
      extra.push({ kind: 'cover', url: m.cover_url, pageUrl: m.source_page || m.cover_url, credit: m.credit || college.name, license: m.license || 'official-site', source: 'manifest' });
    }
    if (m?.logo_url) {
      extra.push({ kind: 'logo', url: m.logo_url, pageUrl: m.source_page || m.logo_url, credit: college.name, license: 'logo', source: 'manifest' });
    }
    try {
      const r = await processCollege(db, college, { dryRun, extra, useJudge: !flag('no-ai') });
      reports.push(r);
      console.log(
        `${String(i + 1).padStart(3)}. ${college.slug.padEnd(48)} ${r.status.padEnd(9)} cover:${r.cover?.source ?? '-'} logo:${r.logo?.source ?? '-'}${r.filled.length ? ` filled:${r.filled.join(',')}` : ''}`,
      );
    } catch (err) {
      if (err instanceof JudgeUnavailableError) {
        console.log(`
Stopped: ${(err as Error).message}. Run again later (the AI daily cap resets at midnight UTC).`);
        break;
      }
      reports.push({ slug: college.slug, status: 'failed', error: (err as Error).message });
      console.log(`${String(i + 1).padStart(3)}. ${college.slug.padEnd(48)} FAILED ${(err as Error).message}`);
    }
  }

  const count = (s: string) => reports.filter((r) => r.status === s).length;
  console.log(`\nfound ${count('found')}, partial ${count('partial')}, not found ${count('not_found')}, skipped ${count('skipped')}, failed ${count('failed')}`);
  const out = manifestPath ? manifestPath.replace(/\.json$/, '') + '-report.json' : 'college-photos-report.json';
  writeFileSync(out, JSON.stringify(reports, null, 2));
  console.log(`Report: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
