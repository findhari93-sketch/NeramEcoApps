/**
 * Stamp the class date onto stored YouTube titles written before dates existed.
 *
 * New listings are built dated by buildYouTubeTitle, and the upload path stamps
 * anything it is handed. Neither reaches the rows already in the table, and the
 * teacher's Copy button reads exactly those rows: without this, correcting the
 * eight videos already on the channel would mean typing eight dates by hand.
 *
 * Idempotent, because it runs the same applyClassDateSuffix the app does: a row
 * that already carries the right date is reported as unchanged, not rewritten.
 * Safe to run twice, and safe to run after new classes have landed.
 *
 * Usage, from the repo root:
 *   npx tsx scripts/backfill-video-title-dates.ts            # dry run, prints the diff
 *   npx tsx scripts/backfill-video-title-dates.ts --write    # actually writes
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Point them at
 * whichever environment you mean: this writes to the database in those two
 * variables and nowhere else, so check them before passing --write.
 */

import { createClient } from '@supabase/supabase-js';
import { applyClassDateSuffix, YT_TITLE_MAX } from '../apps/nexus/src/lib/youtube-metadata';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WRITE = process.argv.includes('--write');

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Database: ${SUPABASE_URL}`);
  console.log(WRITE ? 'Mode: WRITING\n' : 'Mode: dry run, pass --write to apply\n');

  const { data, error } = await supabase
    .from('nexus_class_video_meta')
    .select('id, scheduled_class_id, yt_title, nexus_scheduled_classes!inner(scheduled_date)')
    .not('yt_title', 'is', null);
  if (error) throw error;

  const rows = (data || []) as any[];
  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    // The embed comes back as an object for a to-one relationship, but PostgREST
    // has been known to hand back an array. Take either without complaining.
    const joined = row.nexus_scheduled_classes;
    const scheduledDate: string | null =
      (Array.isArray(joined) ? joined[0]?.scheduled_date : joined?.scheduled_date) ?? null;

    if (!scheduledDate) {
      console.log(`  ?  ${row.scheduled_class_id} has no class date, left alone`);
      continue;
    }

    const next = applyClassDateSuffix(row.yt_title, scheduledDate);
    if (next === row.yt_title) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    console.log(`  ${scheduledDate}`);
    console.log(`    from: ${row.yt_title}`);
    console.log(`      to: ${next}  (${next.length}/${YT_TITLE_MAX})`);

    if (WRITE) {
      const { error: updateError } = await supabase
        .from('nexus_class_video_meta')
        .update({ yt_title: next, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) throw updateError;
    }
  }

  console.log(`\n${changed} to change, ${unchanged} already correct, ${rows.length} listings total.`);
  if (changed && !WRITE) console.log('Nothing was written. Re-run with --write to apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
