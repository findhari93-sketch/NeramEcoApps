/**
 * Bulk-retry WhatsApp `auto_messages` rows that failed with Meta error #131030
 * (recipient not in allowed list). Run this AFTER you have:
 *   1. Verified the business in Meta Business Suite, AND
 *   2. Switched the WhatsApp Business App to Live mode.
 *
 * Resets matching rows so the next `auto-first-touch` cron tick (≤15min)
 * picks them up and resends.
 *
 * Usage:
 *   # dry-run (default): show what would change, no DB writes
 *   pnpm tsx scripts/retry-failed-whatsapp.ts
 *
 *   # actually update the rows
 *   pnpm tsx scripts/retry-failed-whatsapp.ts --execute
 *
 *   # target staging instead of prod (default uses NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_URL=https://db-staging.neramclasses.com \
 *     SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm tsx scripts/retry-failed-whatsapp.ts
 *
 * Requires env vars (loaded from your shell or .env.local manually):
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const EXECUTE = process.argv.includes('--execute');
const LOOKBACK_DAYS = 14;

interface FailedRow {
  id: string;
  user_id: string;
  template_name: string;
  error_message: string | null;
  retry_count: number | null;
  created_at: string;
  sent_at: string | null;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`\n=== Retry failed WhatsApp auto_messages ===`);
  console.log(`Target:        ${SUPABASE_URL}`);
  console.log(`Mode:          ${EXECUTE ? 'EXECUTE (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Lookback:      ${LOOKBACK_DAYS} days (since ${since})`);
  console.log('');

  // Match both new tagged errors (WA_DEV_MODE...) AND legacy raw Meta strings
  // ("(#131030) Recipient phone number not in allowed list").
  const { data, error } = await supabase
    .from('auto_messages')
    .select('id, user_id, template_name, error_message, retry_count, created_at, sent_at')
    .eq('channel', 'whatsapp')
    .eq('delivery_status', 'failed')
    .gte('created_at', since)
    .or('error_message.ilike.WA_DEV_MODE%,error_message.ilike.%131030%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }

  const rows = (data ?? []) as FailedRow[];

  if (rows.length === 0) {
    console.log('No matching rows. Nothing to do.');
    return;
  }

  console.log(`Found ${rows.length} matching row(s):\n`);
  for (const r of rows) {
    console.log(
      `  - ${r.id}  user=${r.user_id}  tmpl=${r.template_name}  retries=${r.retry_count ?? 0}  created=${r.created_at}`
    );
  }
  console.log('');

  if (!EXECUTE) {
    console.log('Dry run only. Re-run with --execute to apply the reset.');
    return;
  }

  const ids = rows.map(r => r.id);
  const nowIso = new Date().toISOString();

  const { error: updateError, count } = await supabase
    .from('auto_messages')
    .update({
      delivery_status: 'pending',
      error_message: null,
      sent_at: null,
      send_after: nowIso,
      retry_count: 0,
    }, { count: 'exact' })
    .in('id', ids);

  if (updateError) {
    console.error('Update failed:', updateError);
    process.exit(1);
  }

  console.log(`Updated ${count ?? ids.length} row(s) → delivery_status='pending', send_after=now()`);
  console.log('Next auto-first-touch cron tick (≤15min) will resend.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
