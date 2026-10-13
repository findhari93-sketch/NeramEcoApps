/**
 * Copies the reviewed college photos, Wikidata facts and FAQs from staging to
 * prod, matching colleges by slug (ids differ across environments).
 *
 * Why copy instead of running the finder on prod: the staging results were
 * judged and spot-checked; a fresh prod run would cost the AI budget again and
 * could pick different photos.
 *
 * Rules:
 *   - photos: copied only where prod has none and prod is not 'manual'; the
 *     file is re-uploaded into prod's own college-photos bucket
 *   - Wikidata facts (coordinates, founding year, socials, aliases...): only
 *     into prod columns that are empty
 *   - FAQs: only where prod's facts hash equals staging's (same facts, so the
 *     answers are true for prod too); locked prod FAQs are never touched.
 *     Colleges whose facts differ are left for the prod FAQ backfill.
 *
 * From apps/admin:
 *   node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs scripts/college-copy-staging-to-prod.ts --dry-run
 *   node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs scripts/college-copy-staging-to-prod.ts
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { credsFor, flag } from './college-env';
import { loadCollegesWithFacts } from '../src/lib/college-content/apply';
import { PHOTO_BUCKET } from '../src/lib/college-photos/apply';
import { photoPath } from '../src/lib/college-photos/match';

const FILL_IF_EMPTY = [
  'wikidata_id',
  'latitude',
  'longitude',
  'established_year',
  'instagram_handle',
  'facebook_url',
  'linkedin_url',
  'youtube_channel_id',
  'website',
] as const;

const COLS =
  'id,slug,status,hero_image_url,hero_image_credit,hero_image_source_url,hero_image_license,logo_url,logo_source_url,photo_status,photo_checked_at,photo_attempts,aliases,' +
  FILL_IF_EMPTY.join(',');

async function main() {
  const dryRun = flag('dry-run');
  const req = createRequire(resolve(__dirname, '..', '..', '..', 'packages', 'database', 'package.json'));
  const { createClient } = req('@supabase/supabase-js');
  const s = credsFor('staging');
  const p = credsFor('prod');
  const staging = createClient(s.url, s.key, { auth: { persistSession: false } });
  const prod = createClient(p.url, p.key, { auth: { persistSession: false } });
  console.log(`${dryRun ? 'DRY RUN: ' : ''}${s.url} -> ${p.url}\n`);

  const [{ data: sRows, error: e1 }, { data: pRows, error: e2 }] = await Promise.all([
    staging.from('colleges').select(COLS).eq('status', 'active').limit(1000),
    prod.from('colleges').select(COLS).eq('status', 'active').limit(1000),
  ]);
  if (e1 || e2) throw e1 || e2;
  const prodBySlug = new Map((pRows as any[]).map((r) => [r.slug, r]));

  const copyFile = async (srcUrl: string, prodId: string, slug: string, kind: 'cover' | 'logo') => {
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const path = photoPath(prodId, slug, kind);
    if (dryRun) return `(dry) ${path}`;
    const { error } = await prod.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`upload: ${error.message}`);
    return prod.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
  };
  const isOurs = (u: string | null) => !!u && u.includes(`/${PHOTO_BUCKET}/`);

  let covers = 0;
  let logos = 0;
  let facts = 0;
  for (const sr of sRows as any[]) {
    const pr = prodBySlug.get(sr.slug);
    if (!pr) continue;
    const update: Record<string, unknown> = {};
    try {
      if (pr.photo_status !== 'manual') {
        if (!pr.hero_image_url && isOurs(sr.hero_image_url)) {
          update.hero_image_url = await copyFile(sr.hero_image_url, pr.id, pr.slug, 'cover');
          Object.assign(update, {
            hero_image_credit: sr.hero_image_credit,
            hero_image_source_url: sr.hero_image_source_url,
            hero_image_license: sr.hero_image_license,
          });
          covers++;
        }
        if (!pr.logo_url && isOurs(sr.logo_url)) {
          update.logo_url = await copyFile(sr.logo_url, pr.id, pr.slug, 'logo');
          update.logo_source_url = sr.logo_source_url;
          logos++;
        }
        const hasCover = !!(update.hero_image_url || pr.hero_image_url);
        const hasLogo = !!(update.logo_url || pr.logo_url);
        if (sr.photo_checked_at) {
          Object.assign(update, {
            photo_status: hasCover && hasLogo ? 'found' : hasCover || hasLogo ? 'partial' : sr.photo_status === 'pending' ? 'pending' : 'not_found',
            photo_checked_at: sr.photo_checked_at,
            photo_attempts: sr.photo_attempts,
          });
        }
      }
      let filled = false;
      for (const col of FILL_IF_EMPTY) {
        if ((pr[col] === null || pr[col] === '') && sr[col] !== null && sr[col] !== '') {
          update[col] = sr[col];
          filled = true;
        }
      }
      if ((!pr.aliases || pr.aliases.length === 0) && sr.aliases?.length) {
        update.aliases = sr.aliases;
        filled = true;
      }
      if (filled) facts++;
      if (Object.keys(update).length && !dryRun) {
        const { error } = await prod.from('colleges').update(update).eq('id', pr.id);
        if (error) throw new Error(`save: ${error.message}`);
      }
    } catch (err) {
      console.log(`  ${sr.slug}: FAILED ${(err as Error).message}`);
    }
  }
  console.log(`photos: ${covers} covers, ${logos} logos; wikidata facts filled on ${facts} colleges`);

  // FAQs: same facts on both sides means the staging answers are true for prod.
  const [sFacts, pFacts] = await Promise.all([loadCollegesWithFacts(staging), loadCollegesWithFacts(prod)]);
  const pFactsBySlug = new Map(pFacts.map((c) => [c.row.slug, c]));
  let copied = 0;
  let differ = 0;
  for (const sc of sFacts) {
    const pc = pFactsBySlug.get(sc.row.slug);
    if (!pc || !sc.row.faq_facts_hash) continue;
    if (sc.hash !== sc.row.faq_facts_hash) continue; // staging FAQs are stale themselves
    if (pc.hash !== sc.hash) {
      differ++;
      continue;
    }
    if (pc.row.faq_facts_hash === pc.hash) continue; // already current on prod
    const { data: faqs, error } = await staging
      .from('college_faqs')
      .select('position,question,answer,intent,fact_keys,generated_by')
      .eq('college_id', sc.row.id)
      .order('position');
    if (error || !faqs?.length) continue;
    copied++;
    if (dryRun) continue;
    const { data: locked } = await prod.from('college_faqs').select('id,intent').eq('college_id', pc.row.id).eq('locked', true);
    const lockedIntents = new Set((locked ?? []).map((r: any) => r.intent));
    let del = prod.from('college_faqs').delete().eq('college_id', pc.row.id).eq('locked', false);
    await del;
    const rows = (faqs as any[]).filter((f) => !lockedIntents.has(f.intent)).map((f) => ({ ...f, college_id: pc.row.id, locked: false }));
    if (rows.length) {
      const { error: insErr } = await prod.from('college_faqs').insert(rows);
      if (insErr) {
        console.log(`  ${sc.row.slug}: FAQ insert FAILED ${insErr.message}`);
        continue;
      }
    }
    await prod.from('colleges').update({ faq_facts_hash: pc.hash, faqs_generated_at: new Date().toISOString() }).eq('id', pc.row.id);
  }
  console.log(`FAQs: copied for ${copied} colleges; ${differ} have different facts on prod (run the prod FAQ backfill for those)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
