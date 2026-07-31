#!/usr/bin/env node
/**
 * SPIKE, THROWAWAY. Delete this file once the result is recorded.
 *
 * Question it answers: can we create a real Teams *channel* meeting from Graph by
 * passing the channel's `19:...@thread.tacv2` id as `chatInfo.threadId` on
 * `POST /me/onlineMeetings`?
 *
 * Why it matters: Nexus currently creates class meetings with
 * `POST /groups/{teamId}/calendar/events` + `isOnlineMeeting: true`. That mints an
 * ORDINARY meeting (`@thread.v2`) parked on the M365 group's calendar. So there is
 * no native "Scheduled a meeting" post with a Join bar, no reply thread for the
 * recording, and nothing in the tutor's own mailbox. A true channel meeting would
 * restore all three at once.
 *
 * Microsoft does not document this. The official Create onlineMeeting page says
 * the API "creates a standalone meeting that isn't associated with any event on
 * the user's calendar", and every chatInfo.threadId example in it is a
 * `@thread.skype` id (the meeting's own chat, i.e. output). Passing a channel
 * thread is a community technique with mixed reports, so we measure rather than
 * assume.
 *
 * Usage:
 *   node scripts/spike-channel-meeting.mjs                     # inspect only, no writes
 *   node scripts/spike-channel-meeting.mjs --create --keep     # create, run gates, leave it
 *   node scripts/spike-channel-meeting.mjs --recheck <id>      # gate 5 second read
 *   node scripts/spike-channel-meeting.mjs --cleanup <id>      # delete post + meeting
 *
 * Auth: `POST /me/onlineMeetings` is delegated only, and the tenant forces MFA, so
 * do not fight device code flow. MSAL caches to localStorage, so lift the live
 * token out of the browser:
 *   1. Sign in to https://nexus.neramclasses.com as a teacher who is a MEMBER of
 *      the target team, open Timetable, and trigger anything that calls
 *      getTeacherToken() (opening Add Class and cancelling is enough).
 *   2. DevTools console on that origin:
 *        Object.entries(localStorage)
 *          .filter(([k]) => k.includes('-accesstoken-'))
 *          .map(([, v]) => { try { return JSON.parse(v); } catch { return null; } })
 *          .filter(t => t && /OnlineMeetings\.ReadWrite/i.test(t.target || ''))
 *          .sort((a, b) => Number(b.expiresOn) - Number(a.expiresOn))[0].secret
 *   3. NEXUS_DELEGATED_TOKEN=... node scripts/spike-channel-meeting.mjs --create
 *      (env var, not argv, so it stays out of shell history)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH = 'https://graph.microsoft.com/v1.0';

const args = process.argv.slice(2);
const CREATE = args.includes('--create');
const KEEP = args.includes('--keep');
const CLEANUP_ID = valueOf('--cleanup');
const RECHECK_ID = valueOf('--recheck');

// Defaults target the "JEE B.Arch Session 1" classroom's team, the one whose
// Jul 31 class exposed the bug. The expected channel id is the value prod already
// stores in nexus_scheduled_classes.teams_channel_id for that class, so asserting
// it also regression-tests the display-name resolution.
const TEAM_ID = valueOf('--team') || '7e3b262b-2fab-4b2a-ade8-1dfe6ead3b6d';
const EXPECT_CHANNEL = '19:6ccb315ce0c547beaeff58ecf16dafea@thread.tacv2';
const MEETING_CHANNEL_NAME = 'Class Meeting Details';
const START = valueOf('--start') || '2026-08-05T21:00:00+05:30';
const END = valueOf('--end') || '2026-08-05T21:30:00+05:30';
const SUBJECT = valueOf('--subject') || 'Nexus setup test, please ignore';

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

/** Same loader the other one-off scripts use. Only needed for AZ_TENANT_ID here. */
function loadEnv() {
  const out = {};
  for (const file of [
    path.join(ROOT, '.env.production'),
    path.join(ROOT, 'apps/nexus/.env.local'),
  ]) {
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
const TOKEN = process.env.NEXUS_DELEGATED_TOKEN || '';

if (!TOKEN) {
  console.error('\nMissing NEXUS_DELEGATED_TOKEN. See the header of this file for how to get one.\n');
  process.exit(1);
}

/** Decode the token's scp claim up front, so a missing scope reads as one line. */
function describeToken(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return {
      upn: payload.upn || payload.preferred_username || payload.unique_name || '(unknown)',
      oid: payload.oid || '(unknown)',
      tid: payload.tid || '(unknown)',
      scopes: (payload.scp || '').split(' ').filter(Boolean),
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '(unknown)',
    };
  } catch {
    return null;
  }
}

async function graph(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* leave json null, the raw text is what matters then */
  }
  return { ok: res.ok, status: res.status, text, json };
}

/**
 * Pull the parts of a channel meeting join URL apart. Copied verbatim from
 * apps/nexus/src/lib/teams-attendance-probe.ts parseChannelJoinUrl, because a
 * throwaway script must not drag the app's module graph in.
 */
function parseChannelJoinUrl(joinUrl) {
  const empty = { threadId: null, messageId: null, organizerOid: null, tenantId: null };
  if (!joinUrl) return empty;

  const pathMatch = joinUrl.match(/\/l\/meetup-join\/([^/?#]+)(?:\/([^/?#]+))?/i);
  let threadId = null;
  let messageId = null;
  if (pathMatch) {
    try {
      threadId = decodeURIComponent(pathMatch[1]);
    } catch {
      threadId = pathMatch[1];
    }
    messageId = pathMatch[2] ? decodeURIComponent(pathMatch[2]) : null;
    if (messageId && !/^\d+$/.test(messageId)) messageId = null;
  }

  let organizerOid = null;
  const contextMatch = joinUrl.match(/[?&]context=([^&]+)/i);
  if (contextMatch) {
    try {
      const ctx = JSON.parse(decodeURIComponent(contextMatch[1]));
      organizerOid = ctx?.Oid ?? null;
    } catch {
      const oid = joinUrl.match(/%22Oid%22%3a%22([^%]+)%22/i);
      organizerOid = oid ? oid[1] : null;
    }
  }
  return { threadId, messageId, organizerOid };
}

/** Mirrors resolveMeetingChannelId in teams-class-announcements.ts. */
async function resolveMeetingChannelId() {
  const findChannel = async (name) => {
    const r = await graph(
      'GET',
      `/teams/${TEAM_ID}/channels?$filter=displayName eq '${name.replace(/'/g, "''")}'`,
    );
    if (!r.ok) return null;
    return r.json?.value?.[0]?.id ?? null;
  };
  return (await findChannel(MEETING_CHANNEL_NAME)) || (await findChannel('General'));
}

const pass = (s) => `  PASS  ${s}`;
const fail = (s) => `  FAIL  ${s}`;
const note = (s) => `  note  ${s}`;

// ───────────────────────────────────────── inspect ─────────────────────────────

async function inspect() {
  const claims = describeToken(TOKEN);
  console.log('\n=== TOKEN ===');
  if (!claims) {
    console.log('  Could not decode the token. Is it a JWT access token, not an id token?');
    process.exit(1);
  }
  console.log(`  user     ${claims.upn}`);
  console.log(`  oid      ${claims.oid}`);
  console.log(`  tenant   ${claims.tid}${env.AZ_TENANT_ID && claims.tid !== env.AZ_TENANT_ID ? '   (does NOT match AZ_TENANT_ID)' : ''}`);
  console.log(`  expires  ${claims.expiresAt}`);
  const needed = ['OnlineMeetings.ReadWrite', 'ChannelMessage.Send', 'Channel.ReadBasic.All'];
  for (const s of needed) {
    console.log(claims.scopes.includes(s) ? pass(`scope ${s}`) : fail(`scope ${s} MISSING`));
  }
  if (!claims.scopes.includes('OnlineMeetings.ReadWrite')) {
    console.log('\n  Without OnlineMeetings.ReadWrite the create call cannot work. Grab a teacher token, not the base login token.');
    process.exit(1);
  }

  console.log('\n=== CHANNEL ===');
  const listed = await graph('GET', `/teams/${TEAM_ID}/channels?$select=id,displayName`);
  if (!listed.ok) {
    console.log(fail(`could not list channels: ${listed.status} ${listed.text.slice(0, 400)}`));
    process.exit(1);
  }
  for (const c of listed.json?.value || []) {
    console.log(`  ${c.displayName.padEnd(28)} ${c.id}`);
  }
  const channelId = await resolveMeetingChannelId();
  console.log(`\n  resolved  ${channelId}`);
  console.log(
    channelId === EXPECT_CHANNEL
      ? pass('matches the channel id prod stores on the Jul 31 class')
      : note(`differs from the expected ${EXPECT_CHANNEL}, check which team you targeted`),
  );
  return { channelId, organizerOid: claims.oid };
}

// ───────────────────────────────────────── create ──────────────────────────────

/**
 * Try the minimal body first. createStandaloneMeeting already knows this tenant
 * sometimes rejects the recordAutomatically / lobby / presenter extras, so
 * leading with them would confuse "the tenant dislikes an extra" with "chatInfo
 * is not supported", which is the only question this spike exists to answer.
 */
function variants(channelId) {
  const base = { subject: SUBJECT, startDateTime: START, endDateTime: END };
  return [
    { name: 'A minimal + chatInfo', body: { ...base, chatInfo: { threadId: channelId } } },
    { name: 'B + chatInfo.messageId "0"', body: { ...base, chatInfo: { threadId: channelId, messageId: '0' } } },
    {
      name: 'C + recording and lobby extras',
      body: {
        ...base,
        chatInfo: { threadId: channelId },
        recordAutomatically: true,
        lobbyBypassSettings: { scope: 'organization', isDialInBypassEnabled: true },
        allowedPresenters: 'organizer',
      },
    },
  ];
}

async function create() {
  const { channelId, organizerOid } = await inspect();
  if (!channelId) {
    console.log(fail('no channel resolved, cannot continue'));
    process.exit(1);
  }

  console.log('\n=== CREATE ===');
  let created = null;
  let usedVariant = null;
  for (const v of variants(channelId)) {
    console.log(`\n  -> ${v.name}`);
    console.log(`     ${JSON.stringify(v.body)}`);
    const r = await graph('POST', '/me/onlineMeetings', v.body);
    console.log(`     ${r.status}`);
    if (!r.ok) {
      console.log(`     ${r.text.slice(0, 800)}`);
      continue;
    }
    created = r.json;
    usedVariant = v.name;
    break;
  }

  if (!created) {
    console.log('\n  Every variant was refused. VERDICT: BRANCH B.');
    process.exit(0);
  }

  console.log(`\n  created with variant: ${usedVariant}`);
  console.log(`  id            ${created.id}`);
  console.log(`  joinWebUrl    ${created.joinWebUrl}`);
  console.log(`  chatInfo      ${JSON.stringify(created.chatInfo)}`);
  console.log(`  subject       ${JSON.stringify(created.subject)}`);

  // ── the gates ──
  console.log('\n=== GATES ===');
  const results = [];
  const gate = (n, ok, msg) => {
    results.push(ok);
    console.log(ok ? pass(`${n}. ${msg}`) : fail(`${n}. ${msg}`));
  };

  const joinUrl = created.joinWebUrl || '';
  const parsed = parseChannelJoinUrl(joinUrl);

  gate(1, /thread\.tacv2/i.test(joinUrl), `join URL is a channel thread (got ${parsed.threadId || 'nothing'})`);
  gate(2, !!parsed.messageId, `join URL carries a numeric epoch segment (got ${parsed.messageId || 'none'})`);
  gate(
    3,
    typeof created.chatInfo?.threadId === 'string' && created.chatInfo.threadId.includes('thread.tacv2'),
    `response chatInfo.threadId echoes the channel thread (got ${created.chatInfo?.threadId || 'nothing'})`,
  );

  // Gate 4: the native post. Its id should equal the join URL epoch. Confirming
  // that equality is what lets the real implementation derive the root message id
  // instead of storing a new column for it.
  const msgs = await graph('GET', `/teams/${TEAM_ID}/channels/${channelId}/messages?$top=10`);
  let rootPost = null;
  if (msgs.ok) {
    rootPost = (msgs.json?.value || []).find((m) => m.id === parsed.messageId) || null;
    if (!rootPost) {
      console.log(note(`10 most recent message ids: ${(msgs.json?.value || []).map((m) => m.id).join(', ')}`));
    }
  } else {
    console.log(note(`could not read channel messages: ${msgs.status} ${msgs.text.slice(0, 300)}`));
  }
  gate(4, !!rootPost, 'a native channel post exists whose id equals the join URL epoch');
  if (rootPost) {
    console.log(note(`post subject: ${JSON.stringify(rootPost.subject)}`));
    console.log(note(`post body preview: ${String(rootPost.body?.content || '').slice(0, 200)}`));
  }

  const reread = await graph('GET', `/me/onlineMeetings/${created.id}`);
  gate(6, reread.ok, `GET /me/onlineMeetings/{id} returns 200 (got ${reread.status})`);
  const endedNow = / ended$/i.test(reread.json?.subject || '');
  gate(5, !endedNow, `subject has no " ended" suffix on first re-read (got ${JSON.stringify(reread.json?.subject)})`);

  // ── recorded, not gated ──
  console.log('\n=== RECORDED, NOT GATED ===');
  const byFilter = await graph(
    'GET',
    `/me/onlineMeetings?$filter=JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`,
  );
  console.log(
    note(
      `JoinWebUrl filter lookup: ${byFilter.status}, ${byFilter.json?.value?.length ?? 0} result(s). ` +
        'This settles the open question in teams-attendance-probe.ts about whether a channel meeting is findable that way.',
    ),
  );
  const ev = await graph('GET', `/me/events?$top=5&$select=subject,start&$orderby=createdDateTime desc`);
  console.log(note(`recent /me/events subjects: ${(ev.json?.value || []).map((e) => e.subject).join(' | ') || '(none)'}`));
  console.log(note(`organizer oid from join URL: ${parsed.organizerOid} (token oid ${organizerOid})`));

  const allPassed = results.every(Boolean);
  console.log(`\n=== VERDICT: ${allPassed ? 'BRANCH A, chatInfo works' : 'BRANCH B, fall back to supported APIs'} ===`);
  console.log('\nStill to check by eye in Teams desktop before trusting BRANCH A:');
  console.log('  - the channel shows a purple Join bar on that post');
  console.log('  - re-run with --recheck to confirm the subject has not gained " ended" after a couple of minutes');
  console.log(`\n  node scripts/spike-channel-meeting.mjs --recheck ${created.id}`);
  console.log(`  node scripts/spike-channel-meeting.mjs --cleanup ${created.id} --message-id ${parsed.messageId}\n`);

  if (!KEEP) {
    console.log('Cleaning up (pass --keep to leave it in place for an eyeball check).');
    await cleanup(created.id, parsed.messageId, channelId);
  }
}

// ───────────────────────────────────── recheck / cleanup ───────────────────────

async function recheck(id) {
  const r = await graph('GET', `/me/onlineMeetings/${id}`);
  console.log(`\n  ${r.status}  subject: ${JSON.stringify(r.json?.subject)}`);
  console.log(
    / ended$/i.test(r.json?.subject || '')
      ? fail('subject gained an " ended" suffix, this is the reported Graph bug. VERDICT: BRANCH B.')
      : pass('subject is still intact'),
  );
}

/** 404 and 410 count as success, same as isDeleteSettled in the app. */
const settled = (status) => status === 204 || status === 200 || status === 404 || status === 410;

async function cleanup(id, messageId, channelId) {
  const chan = channelId || (await resolveMeetingChannelId());
  const msgId = messageId || valueOf('--message-id');

  if (chan && msgId) {
    const r = await graph('POST', `/teams/${TEAM_ID}/channels/${chan}/messages/${msgId}/softDelete`);
    console.log(settled(r.status) ? pass(`channel post ${msgId} removed`) : fail(`channel post ${msgId}: ${r.status} ${r.text.slice(0, 300)}`));
  } else {
    console.log(note('no message id known, skipping the channel post delete'));
  }

  const r = await graph('DELETE', `/me/onlineMeetings/${id}`);
  console.log(settled(r.status) ? pass(`meeting ${id} deleted`) : fail(`meeting ${id}: ${r.status} ${r.text.slice(0, 300)}`));
}

// ───────────────────────────────────────── main ────────────────────────────────

if (RECHECK_ID) {
  await recheck(RECHECK_ID);
} else if (CLEANUP_ID) {
  await cleanup(CLEANUP_ID, valueOf('--message-id'), null);
} else if (CREATE) {
  await create();
} else {
  await inspect();
  console.log('\nInspect only, nothing was written. Add --create to run the real test.\n');
}
