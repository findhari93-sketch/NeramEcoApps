/**
 * Measure and fingerprint drawing photos uploaded before fingerprints existed.
 *
 * Flip through hides a sketch that is a re-upload of a sheet already handled or
 * sent to an assignment, by comparing photo fingerprints (see
 * packages/database/src/queries/nexus/drawing-fingerprint.ts). New uploads are
 * fingerprinted on the student's phone; this gives the same to the rows already
 * in the table, so last week's duplicates stop showing too.
 *
 * Runs the exact functions the app runs (measureQuality, drawingFingerprint) on
 * the same 320px copy, decoded with sharp instead of a browser canvas. Merges
 * into image_quality: an existing measurement keeps its numbers and only gains
 * `fp`; a row never measured gets the full measurement. Idempotent: a row that
 * already has a fingerprint is skipped.
 *
 * Usage, from the repo root:
 *   npx tsx scripts/backfill-drawing-fingerprints.ts                 # dry run, last 30 days
 *   npx tsx scripts/backfill-drawing-fingerprints.ts --days 60       # dry run, wider window
 *   npx tsx scripts/backfill-drawing-fingerprints.ts --write         # actually writes
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Point them at
 * whichever environment you mean: this writes to the database in those two
 * variables and nowhere else, so check them before passing --write.
 */

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { MEASURE_SIDE, measureQuality, parseQuality } from '../apps/nexus/src/lib/image-quality';
import { drawingFingerprint } from '../apps/nexus/src/lib/image-fingerprint';

// sharp is a dependency of apps/nexus, not of the scripts package.
const sharp = createRequire(new URL('../apps/nexus/package.json', import.meta.url))('sharp');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WRITE = process.argv.includes('--write');
const daysArg = process.argv.indexOf('--days');
const DAYS = daysArg > 0 ? Number(process.argv[daysArg + 1]) || 30 : 30;

async function measure(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(input).rotate().metadata();
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MEASURE_SIDE, height: MEASURE_SIDE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  const aspect = (meta.width || info.width) / Math.max(1, meta.height || info.height);
  return { quality: measureQuality(pixels, info.width, info.height, aspect), fp: drawingFingerprint(pixels, info.width, info.height) };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  console.log(`Database: ${SUPABASE_URL}`);
  console.log(WRITE ? 'Mode: WRITING\n' : 'Mode: dry run, pass --write to apply\n');

  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('id, source_type, original_image_url, thumbnail_url, image_quality, submitted_at')
    .gte('submitted_at', since)
    .order('submitted_at', { ascending: true });
  if (error) throw error;

  let done = 0;
  let skipped = 0;
  let blank = 0;
  let failed = 0;
  for (const row of (data || []) as any[]) {
    const existing = row.image_quality && typeof row.image_quality === 'object' ? row.image_quality : null;
    if (existing?.fp) { skipped += 1; continue; }
    const url = row.thumbnail_url || row.original_image_url;
    if (!url) { failed += 1; continue; }
    try {
      const { quality, fp } = await measure(url);
      if (!fp) { blank += 1; console.log(`  ${row.id} ${row.source_type}: no fingerprint (blank or unreadable)`); continue; }
      // Keep the phone's numbers when they exist; they were taken from the full photo.
      const merged = parseQuality(existing) ? { ...existing, fp } : { ...quality, fp };
      console.log(`  ${row.id} ${row.source_type}: ${fp.slice(0, 12)}...${existing ? ' (merged)' : ''}`);
      if (WRITE) {
        const { error: updateError } = await supabase.from('drawing_submissions').update({ image_quality: merged }).eq('id', row.id);
        if (updateError) throw updateError;
      }
      done += 1;
    } catch (e) {
      failed += 1;
      console.log(`  ${row.id}: FAILED ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n${WRITE ? 'Wrote' : 'Would write'} ${done}; already had one ${skipped}; blank ${blank}; failed ${failed}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
