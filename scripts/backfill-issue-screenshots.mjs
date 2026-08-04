#!/usr/bin/env node
/**
 * Re-attach the screenshots that reported issues lost on the way in.
 *
 * Why this exists: the report dialog uploaded the auto-captured page shot from a
 * `useEffect` whose own cleanup cancelled the state write that carried the
 * returned path. Every screenshot reached the `issue-screenshots` bucket and not
 * one ever reached `nexus_foundation_issues.screenshot_urls`, so the bucket
 * holds orphans and every ticket looks like it came without a picture.
 *
 * The dialog is fixed. This repairs the tickets filed while it was not.
 *
 * Matching rule: an object at `<student_id>/<timestamp>.jpg` belongs to the
 * ticket by that same student created AFTER the upload and within 20 minutes of
 * it, nearest ticket wins. That is how the flow actually ran, capture first,
 * then the student typed, then submitted. Objects with no ticket in that window
 * are abandoned dialogs and are left alone.
 *
 * Usage:
 *   node scripts/backfill-issue-screenshots.mjs --env staging
 *   node scripts/backfill-issue-screenshots.mjs --env staging --apply
 *   node scripts/backfill-issue-screenshots.mjs --env prod --apply
 *
 * Dry run by default: it prints exactly what it would write and changes nothing.
 *
 * Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'issue-screenshots';
const WINDOW_MS = 20 * 60 * 1000;
/** A student who reopened the dialog five times left five near-identical shots. */
const MAX_PER_ISSUE = 3;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ENV = valueOf('--env') || 'staging';

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

/**
 * `apps/nexus/.env.local` points at STAGING, so it is only ever the fallback.
 * The resolved host is printed before anything is written, because backfilling
 * the wrong database is the expensive mistake here.
 */
function loadEnv() {
  const byEnv = {
    prod: ['.env.production'],
    production: ['.env.production'],
    staging: ['.env.staging', 'apps/nexus/.env.local'],
    local: ['apps/nexus/.env.local'],
  };
  const candidates = (byEnv[ENV] || byEnv.staging).map((f) => path.join(ROOT, f));
  const out = {};
  for (const file of [...candidates, path.join(ROOT, 'apps/nexus/.env.local')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      if (out[key] !== undefined) continue;
      out[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = loadEnv();
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[key]) {
    console.error(`Missing ${key}. Checked .env.${ENV} and apps/nexus/.env.local.`);
    process.exit(1);
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log(`\nEnvironment : ${ENV}`);
  console.log(`Supabase    : ${env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Mode        : ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`);

  const { data: issues, error } = await supabase
    .from('nexus_foundation_issues')
    .select('id, ticket_number, student_id, created_at, screenshot_urls')
    .is('screenshot_urls', null)
    .order('created_at', { ascending: true });
  if (error) throw error;

  console.log(`Tickets with no screenshot: ${issues.length}`);

  const byStudent = new Map();
  for (const issue of issues) {
    if (!byStudent.has(issue.student_id)) byStudent.set(issue.student_id, []);
    byStudent.get(issue.student_id).push(issue);
  }

  // One object belongs to at most one ticket, so claims are tracked per ticket
  // and resolved nearest-first.
  const claims = new Map(); // issue.id -> [{ path, uploadedAt }]
  let scanned = 0;

  for (const [studentId, studentIssues] of byStudent) {
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(studentId, { limit: 1000 });
    if (listError) {
      console.warn(`  ! could not list ${studentId}: ${listError.message}`);
      continue;
    }
    if (!files?.length) continue;

    for (const file of files) {
      if (file.id === null) continue; // a nested folder, not an object
      scanned += 1;
      const uploadedAt = new Date(file.created_at).getTime();

      let best = null;
      let bestGap = Infinity;
      for (const issue of studentIssues) {
        const gap = new Date(issue.created_at).getTime() - uploadedAt;
        if (gap < 0 || gap >= WINDOW_MS) continue;
        if (gap < bestGap) {
          bestGap = gap;
          best = issue;
        }
      }
      if (!best) continue;

      if (!claims.has(best.id)) claims.set(best.id, []);
      claims.get(best.id).push({ path: `${studentId}/${file.name}`, uploadedAt, gap: bestGap });
    }
  }

  const matchedObjects = [...claims.values()].reduce((n, list) => n + Math.min(list.length, MAX_PER_ISSUE), 0);
  console.log(`Objects scanned           : ${scanned}`);
  console.log(`Tickets with a match      : ${claims.size}`);
  console.log(`Objects to attach         : ${matchedObjects}\n`);

  const byId = new Map(issues.map((i) => [i.id, i]));
  let written = 0;

  for (const [issueId, matches] of claims) {
    const issue = byId.get(issueId);

    // Keep the shots taken closest to submission, they are the ones that show
    // what the student was looking at when they wrote the ticket.
    const nearest = [...matches].sort((a, b) => a.gap - b.gap);
    const kept = nearest.slice(0, MAX_PER_ISSUE).sort((a, b) => a.uploadedAt - b.uploadedAt);
    const dropped = nearest.slice(MAX_PER_ISSUE);
    const paths = kept.map((m) => m.path);

    console.log(`${issue.ticket_number}  ${new Date(issue.created_at).toISOString()}`);
    for (const match of kept) {
      console.log(`   ← ${match.path}  (${Math.round(match.gap / 1000)}s before the ticket)`);
    }
    for (const match of dropped) {
      console.log(`   · skipped (over the ${MAX_PER_ISSUE}-image cap): ${match.path}`);
    }

    if (!APPLY) continue;

    const { error: updateError } = await supabase
      .from('nexus_foundation_issues')
      .update({ screenshot_urls: paths })
      .eq('id', issueId)
      .is('screenshot_urls', null); // never overwrite a ticket that has one
    if (updateError) {
      console.error(`   ! failed: ${updateError.message}`);
      continue;
    }
    written += 1;
  }

  console.log(
    APPLY
      ? `\nDone. ${written} ticket${written === 1 ? '' : 's'} updated.`
      : '\nDry run. Re-run with --apply to write these.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
