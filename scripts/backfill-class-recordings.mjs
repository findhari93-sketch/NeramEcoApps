#!/usr/bin/env node
/**
 * Attach the class recordings that Nexus never managed to find.
 *
 * Why this exists: the channel Recordings listing sent `$orderby`, which Graph
 * rejects on a SharePoint drive, and the resulting 400 was swallowed into an
 * empty result. Every channel recording was therefore invisible, and any class
 * older than seven days was then stamped `recording_fetched_at` and never
 * retried. Separately, the manual sync stored `recordingContentUrl`, a Graph
 * address that needs a bearer token, so the one class that did get a link had a
 * link nobody could open.
 *
 * The code is fixed; this repairs the rows that were written while it was not.
 *
 * What it does, per class with no usable recording:
 *   1. Look in the class team's channel `Recordings/` folder.
 *   2. Failing that, look in the meeting organizer's OneDrive `Recordings/`.
 *   3. Write the matched driveItem webUrl, never a Graph URL.
 * Classes still unmatched get their `recording_fetched_at` cleared, so the fixed
 * sync retries them instead of treating them as settled.
 *
 * Usage:
 *   node scripts/backfill-class-recordings.mjs --env prod
 *   node scripts/backfill-class-recordings.mjs --env prod --apply
 *   node scripts/backfill-class-recordings.mjs --env prod --apply --since 2026-06-01
 *
 * Dry run by default: it prints exactly what it would write and changes nothing.
 *
 * Env vars, read from apps/nexus/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AZ_CLIENT_ID, AZ_CLIENT_SECRET, AZ_TENANT_ID
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const VIDEO_RE = /\.(mp4|mkv)$/i;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ENV = valueOf('--env') || 'prod';
const SINCE = valueOf('--since') || '2026-06-01';

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

/**
 * Load credentials for the requested environment.
 *
 * `apps/nexus/.env.local` points at STAGING, so it is only the fallback. Getting
 * this wrong means quietly backfilling the wrong database, hence the loud banner
 * printed with the resolved Supabase host before anything is written.
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
  // Later files fill gaps only, so the env-specific file always wins.
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

for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AZ_CLIENT_ID',
  'AZ_CLIENT_SECRET',
  'AZ_TENANT_ID',
]) {
  if (!env[key]) {
    console.error(`Missing ${key} in apps/nexus/.env.local`);
    process.exit(1);
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function appToken() {
  const res = await fetch(`https://login.microsoftonline.com/${env.AZ_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.AZ_CLIENT_ID,
      client_secret: env.AZ_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token failed: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

/**
 * List video files under a driveItem children URL.
 *
 * No `$orderby`: Graph answers `400 notSupported` for it on these drives, which
 * is the whole reason this backfill is needed. Sorting happens here instead.
 */
async function listVideos(url, token) {
  const out = [];
  let next = url;
  let page = 0;
  while (next && page < 25) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (page === 0) return { files: [], status: res.status };
      break;
    }
    const data = await res.json();
    for (const f of data.value || []) {
      if (!VIDEO_RE.test(f.name || '')) continue;
      out.push({
        name: f.name,
        webUrl: f.webUrl,
        createdDateTime: f.createdDateTime,
        size: f.size ?? 0,
        durationMs: typeof f.video?.duration === 'number' ? f.video.duration : undefined,
      });
    }
    next = data['@odata.nextLink'] || null;
    page++;
  }
  out.sort((a, b) => Date.parse(b.createdDateTime) - Date.parse(a.createdDateTime));
  return { files: out };
}

const QUERY = '?$select=name,webUrl,createdDateTime,size,video&$top=200';

/** Mirrors lib/channel-recordings isSubstantialRecording. Keep the two in step. */
const MIN_DURATION_MS = 3 * 60 * 1000;
const MIN_BYTES = 5 * 1024 * 1024;

function isSubstantial(f) {
  if (f.durationMs != null && f.durationMs > 0) return f.durationMs >= MIN_DURATION_MS;
  if (f.size > 0) return f.size >= MIN_BYTES;
  return true;
}

async function channelRecordings(token, teamId) {
  const chRes = await fetch(
    `${GRAPH}/teams/${teamId}/channels?$filter=displayName eq 'General'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!chRes.ok) return [];
  const channelId = (await chRes.json()).value?.[0]?.id;
  if (!channelId) return [];

  const folderRes = await fetch(`${GRAPH}/teams/${teamId}/channels/${channelId}/filesFolder`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!folderRes.ok) return [];
  const folder = await folderRes.json();
  const driveId = folder.parentReference?.driveId;
  if (!driveId || !folder.id) return [];

  const { files, status } = await listVideos(
    `${GRAPH}/drives/${driveId}/items/${folder.id}:/Recordings:/children${QUERY}`,
    token,
  );
  if (status && status !== 404) {
    throw new Error(`Channel Recordings listing failed: ${status}`);
  }
  return files;
}

async function oneDriveRecordings(token, oid) {
  const { files, status } = await listVideos(
    `${GRAPH}/users/${oid}/drive/root:/Recordings:/children${QUERY}`,
    token,
  );
  if (status && status !== 404) throw new Error(`OneDrive Recordings listing failed: ${status}`);
  return files;
}

/** The organizer oid embedded by Teams in the join URL's context param. */
function oidFromJoinUrl(joinUrl) {
  if (!joinUrl) return null;
  try {
    const context = new URL(joinUrl).searchParams.get('context');
    if (context) return JSON.parse(context).Oid || null;
  } catch {
    /* fall through to the regex */
  }
  const m = joinUrl.match(/%22Oid%22%3a%22([a-f0-9-]+)%22/i);
  return m ? m[1] : null;
}

/**
 * Same rule as lib/channel-recordings: closest start time inside tolerance,
 * after dropping the stubs anyone in the meeting can leave behind.
 */
function matchRecording(all, cls, toleranceHours = 3) {
  const files = all.filter(isSubstantial);
  if (!files.length) return null;
  const startMs = Date.parse(`${cls.scheduled_date}T${cls.start_time.substring(0, 5)}:00+05:30`);
  if (Number.isNaN(startMs)) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const f of files) {
    const delta = Math.abs(Date.parse(f.createdDateTime) - startMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = f;
    }
  }
  return bestDelta <= toleranceHours * 3600 * 1000 ? best : null;
}

const isGraphUrl = (u) => {
  try {
    return new URL(u).hostname.toLowerCase() === 'graph.microsoft.com';
  } catch {
    return false;
  }
};

async function main() {
  console.log(
    `env=${ENV}  db=${env.NEXT_PUBLIC_SUPABASE_URL}  since=${SINCE}  mode=${APPLY ? 'APPLY' : 'DRY RUN'}\n`,
  );
  const token = await appToken();

  const { data: classes, error } = await supabase
    .from('nexus_scheduled_classes')
    .select(
      'id, title, scheduled_date, start_time, classroom_id, teacher_id, organizer_email, recording_url, recording_fetched_at, teams_meeting_join_url',
    )
    .gte('scheduled_date', SINCE)
    .not('teams_meeting_join_url', 'is', null)
    .order('scheduled_date');

  if (error) throw error;

  // Only classes with nothing usable: no link at all, or a Graph URL that no
  // browser can open.
  const targets = (classes || []).filter((c) => !c.recording_url || isGraphUrl(c.recording_url));
  console.log(`${classes?.length ?? 0} classes since ${SINCE}, ${targets.length} need a recording\n`);
  if (!targets.length) return;

  const { data: classrooms } = await supabase
    .from('nexus_classrooms')
    .select('id, ms_team_id');
  const teamOf = new Map((classrooms || []).map((c) => [c.id, c.ms_team_id]));

  const channelCache = new Map();
  const oneDriveCache = new Map();
  let matched = 0;
  let cleared = 0;

  for (const cls of targets) {
    const teamId = teamOf.get(cls.classroom_id);
    let files = [];

    if (teamId) {
      if (!channelCache.has(teamId)) {
        try {
          channelCache.set(teamId, await channelRecordings(token, teamId));
        } catch (err) {
          console.error(`  ! channel listing failed for team ${teamId}: ${err.message}`);
          channelCache.set(teamId, []);
        }
      }
      files = channelCache.get(teamId);
    }

    let hit = matchRecording(files, cls);
    let source = 'channel';

    if (!hit) {
      let oid = oidFromJoinUrl(cls.teams_meeting_join_url);
      if (!oid && cls.organizer_email) {
        const { data } = await supabase
          .from('users')
          .select('ms_oid')
          .ilike('email', cls.organizer_email.replace(/([%_\\])/g, '\\$1'))
          .maybeSingle();
        oid = data?.ms_oid || null;
      }
      if (!oid && cls.teacher_id) {
        const { data } = await supabase
          .from('users')
          .select('ms_oid')
          .eq('id', cls.teacher_id)
          .maybeSingle();
        oid = data?.ms_oid || null;
      }

      if (oid) {
        if (!oneDriveCache.has(oid)) {
          try {
            oneDriveCache.set(oid, await oneDriveRecordings(token, oid));
          } catch (err) {
            console.error(`  ! OneDrive listing failed for ${oid}: ${err.message}`);
            oneDriveCache.set(oid, []);
          }
        }
        // Tighter tolerance on OneDrive: a personal drive holds everything the
        // teacher ever recorded, not just classes, so only a close time match counts.
        hit = matchRecording(oneDriveCache.get(oid), cls, 1.5);
        source = 'onedrive';
      }
    }

    const label = `${cls.scheduled_date}  ${cls.title.slice(0, 48).padEnd(48)}`;

    if (hit) {
      matched++;
      console.log(`MATCH  ${label}  [${source}]  ${hit.name}`);
      if (APPLY) {
        const { error: upErr } = await supabase
          .from('nexus_scheduled_classes')
          .update({ recording_url: hit.webUrl, recording_fetched_at: new Date().toISOString() })
          .eq('id', cls.id);
        if (upErr) console.error(`  ! update failed: ${upErr.message}`);
      }
    } else {
      // Clear the give-up marker so the fixed sync tries again rather than
      // treating "we looked once, badly" as settled.
      const needsClearing = !!cls.recording_fetched_at || isGraphUrl(cls.recording_url || '');
      console.log(`none   ${label}  ${needsClearing ? '(re-arming sync)' : ''}`);
      if (APPLY && needsClearing) {
        cleared++;
        const { error: upErr } = await supabase
          .from('nexus_scheduled_classes')
          .update({ recording_url: null, recording_fetched_at: null })
          .eq('id', cls.id);
        if (upErr) console.error(`  ! re-arm failed: ${upErr.message}`);
      }
    }
  }

  console.log(`\n${matched} matched, ${cleared} re-armed for the next sync.`);
  if (!APPLY) console.log('Dry run: nothing was written. Re-run with --apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
