import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  getClassPrepTest,
  getClassTestForClass,
  getRecapByClass,
  getNexusSetting,
} from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { classShareLinks, shareBaseUrl } from '@/lib/class-share-links';
import {
  buildShareSections,
  resolveClassState,
  toShareAssignment,
  TOGGLEABLE_SECTIONS,
  type ClassSharePayload,
  type ClassShareResponse,
  type ShareAssignment,
  type ShareSectionId,
  type WatchKind,
} from '@/lib/class-share-model';
import { renderShareHtml, shareUrls } from '@/lib/class-share-render';
import {
  isPostError,
  postChannelMessageDetailed,
  postChatMessageDetailed,
  resolveMeetingChannelId,
} from '@/lib/teams-class-announcements';
import { FEATURE_FLAGS_KEY, featureForPath, resolveFlags, type FlagMap } from '@/lib/feature-flags';

/**
 * "Share this class": one message a teacher can paste into the class group or
 * post straight to Teams, carrying the recording, the homework and the test.
 *
 * GET  assembles the facts. POST renders them and sends them to Graph.
 *
 * Why a route rather than assembling in the panel: the teacher timetable does
 * not hold the assignments (only the student page passes that prop), and three
 * of the inputs cannot be read from a browser at all. getRecapByClass and
 * getClassTestForClass need the admin client, the feature-flag preflight needs
 * nexus_settings, and the upcoming/past decision must be made in IST on the
 * server. A teacher whose phone clock is wrong must not get the wrong template.
 *
 * Cost: one invocation per Share tap. Nothing here runs on panel open or page
 * load, and the response is per-user and authorization-dependent, so it is
 * uncacheable by construction.
 */

interface Ctx {
  params: { classId: string };
}

const SHARE_CLASS_COLS = [
  'id',
  'classroom_id',
  'teacher_id',
  'title',
  'description',
  'summary_bullets',
  'scheduled_date',
  'start_time',
  'end_time',
  'status',
  'recording_url',
  'youtube_url',
  // The fallback tutor name. A class imported from Teams never had teacher_id
  // resolved, and a message that does not say who took the class is the one
  // students ask about.
  'organizer_name',
  'teams_meeting_join_url',
  'teams_meeting_url',
  'teams_channel_id',
  'teams_share_message_id',
  'teams_share_chat_message_id',
  'teams_share_posted_at',
].join(', ');

interface ShareClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string | null;
  description: string | null;
  summary_bullets: unknown;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  recording_url: string | null;
  youtube_url: string | null;
  organizer_name: string | null;
  teams_meeting_join_url: string | null;
  teams_meeting_url: string | null;
  teams_channel_id: string | null;
  teams_share_message_id: string | null;
  teams_share_chat_message_id: string | null;
  teams_share_posted_at: string | null;
}

/**
 * Resolve the caller and confirm they may share this class.
 *
 * canEdit, not a capability string. Every teaching capability sits in
 * SHARED_STAFF, so "holds teach.session.run" only means "is staff"; canRunSession
 * also answers "on THIS class", which is the question that matters when an
 * external teacher opens someone else's. Internal staff (admin, manager) pass on
 * any class, which is exactly the "teachers and admin" audience this is for.
 */
async function access(supabase: any, msOid: string, classId: string) {
  return resolveClassStaffAccess<ShareClass>(supabase, msOid, classId, SHARE_CLASS_COLS);
}

/** summary_bullets is JSONB, so anything could be in there. */
function readBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => String(b ?? '').trim()).filter(Boolean);
}

/**
 * Where a student should be sent to watch a past class.
 *
 * NEVER cls.recording_url. That is a SharePoint URL shared only with the
 * meeting's invitees; pasting it into a class channel is precisely the leak
 * student.protected-video exists to close.
 *
 *   1. A published, ready recap  -> the guided player, which keeps the quiz
 *                                   gate and the watch tracking.
 *   2. A recap that is not live yet -> fall through, and say so, rather than
 *                                   sending everyone at a page that refuses them.
 *   3. Any recording at all      -> the per-class catch-up page, which already
 *                                   runs this same ladder internally and carries
 *                                   the reason step, the work and the resources.
 *   4. Nothing                   -> no recording section at all.
 */
async function resolveWatchLink(
  supabase: any,
  cls: ShareClass,
  links: ReturnType<typeof classShareLinks>,
): Promise<{ url: string | null; kind: WatchKind; pending: boolean }> {
  let pending = false;
  try {
    const recap = (await getRecapByClass(cls.id, supabase)) as any;
    if (recap?.id) {
      // readiness may be null on rows written before the column existed, which
      // must not hide a recap that was already published. Same rule the
      // video-embed route applies.
      const ready = recap.status === 'published' && (recap.readiness == null || recap.readiness === 'ready');
      if (ready) return { url: links.recap(recap.id), kind: 'recap', pending: false };
      pending = true;
    }
  } catch (err) {
    // A recap lookup must not sink the whole share. Fall through to catch-up.
    console.error('Recap lookup failed while building a class share (non-blocking):', err);
  }

  if (cls.recording_url || cls.youtube_url) {
    return { url: links.catchUp(cls.id), kind: 'catchup', pending };
  }
  return { url: null, kind: 'none', pending };
}

/** Flags are advisory here: a failed read must not block a teacher from sharing. */
async function loadFlags(): Promise<FlagMap> {
  try {
    const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
    return resolveFlags((setting?.value as FlagMap) || {});
  } catch {
    return resolveFlags({});
  }
}

/**
 * Which student surfaces in this message are switched off right now.
 *
 * Most student flags default OFF in this deployment, so a perfectly correct
 * link can still refuse every student who taps it. That is configuration, not a
 * bug, but a teacher must be told before they post rather than after.
 */
function flagWarningsFor(urls: string[], flags: FlagMap): Array<{ featureId: string; label: string }> {
  const seen = new Map<string, string>();
  for (const url of urls) {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!pathname.startsWith('/student')) continue;
    const feature = featureForPath(pathname);
    if (feature && flags[feature.id] === false) seen.set(feature.id, feature.label);
  }
  return Array.from(seen, ([featureId, label]) => ({ featureId, label }));
}

/** Everything the dialog and the POST handler both need, read once. */
async function assembleSharePayload(
  supabase: any,
  cls: ShareClass,
  request: NextRequest,
): Promise<ClassShareResponse> {
  const base = shareBaseUrl(request.nextUrl.origin);
  const links = classShareLinks(base);
  const state = resolveClassState(
    { scheduled_date: cls.scheduled_date, end_time: cls.end_time, status: cls.status },
    Date.now(),
  );
  const past = state === 'past';

  const [classroomRes, assignmentRes, prepTest, classTest, watch, flags, tutor] = await Promise.all([
    supabase.from('nexus_classrooms').select('ms_team_id, ms_group_chat_id').eq('id', cls.classroom_id).single(),
    supabase
      .from('nexus_class_assignments')
      .select('id, title, timing, due_at, assignment_type, status')
      .eq('scheduled_class_id', cls.id)
      .order('due_at', { ascending: true, nullsFirst: false }),
    // Only meaningful before the class. Skipped after, so a finished class does
    // not advertise a door that is already open.
    past ? Promise.resolve(null) : getClassPrepTest(cls.id, supabase).catch(() => null),
    past ? getClassTestForClass(cls.id, supabase).catch(() => null) : Promise.resolve(null),
    past ? resolveWatchLink(supabase, cls, links) : Promise.resolve({ url: null, kind: 'none' as WatchKind, pending: false }),
    loadFlags(),
    cls.teacher_id
      ? supabase.from('users').select('name').eq('id', cls.teacher_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // A draft assignment is not visible to a student, so linking it would send the
  // class at a page that tells them nothing exists.
  const assignments: ShareAssignment[] = ((assignmentRes?.data as any[]) || [])
    .filter((a) => a.status === 'published')
    .map((a) => toShareAssignment(a, base));

  /**
   * The prep gate withholds the join URL from a student who has not passed. A
   * share message carrying that URL into the class channel would hand it to
   * everyone at once, which is the same reasoning that suppresses the panel's
   * copy-link button for a gated student.
   */
  const gateArmed = !past && !!prepTest && flags['student.class-prep-gate'] !== false;
  const joinUrl = gateArmed ? null : cls.teams_meeting_join_url || cls.teams_meeting_url;

  const payload: ClassSharePayload = {
    classId: cls.id,
    title: cls.title || 'Class',
    scheduled_date: cls.scheduled_date,
    start_time: cls.start_time,
    end_time: cls.end_time,
    state,
    tutorName: ((tutor as any)?.data?.name as string) || cls.organizer_name || null,
    description: cls.description,
    summaryBullets: readBullets(cls.summary_bullets),
    links: {
      join: joinUrl,
      rsvp: past ? null : links.rsvp(cls.id),
      watch: watch.url,
      watchKind: watch.kind,
      prepTest: prepTest ? links.prepTest(cls.id) : null,
      classTest: classTest ? links.catchUpTest(cls.id) : null,
    },
    prepTest: prepTest
      ? { title: prepTest.title, questionCount: prepTest.question_count, passingPct: prepTest.passing_pct }
      : null,
    classTest: classTest
      ? { questionCount: classTest.question_count, passingPct: classTest.passing_pct }
      : null,
    assignments,
  };

  const everySection = new Set<ShareSectionId>(TOGGLEABLE_SECTIONS);
  const urls = shareUrls(buildShareSections(payload), everySection);
  const classroom = (classroomRes as any)?.data;

  return {
    ...payload,
    teams: { hasChannel: !!classroom?.ms_team_id, hasGroupChat: !!classroom?.ms_group_chat_id },
    flagWarnings: flagWarningsFor(urls, flags),
    recapPending: watch.pending,
    lastPostedAt: cls.teams_share_posted_at,
  };
}

/**
 * GET /api/timetable/[classId]/share   (staff)
 *
 * Facts and resolved URLs, never rendered text. Rendering happens in the pure
 * module both the dialog and POST call, so the two can never say different
 * things and the Teams post never trusts client-supplied markup.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can share a class' }, { status: 403 });
    }

    return NextResponse.json(await assembleSharePayload(supabase, acc.cls, request));
  } catch (err) {
    return errorResponse(err, 'Failed to build the class share');
  }
}

/**
 * POST /api/timetable/[classId]/share   (staff)
 * Body: { sections: ShareSectionId[], targets?: ('channel' | 'chat')[] }
 *
 * The body carries the teacher's section choices and nothing else, ever. The
 * message is re-assembled from the database and re-rendered here, so no client
 * HTML reaches Graph.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}) as any);
    const supabase = getSupabaseAdminClient() as any;

    const acc = await access(supabase, msUser.oid, params.classId);
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can share a class' }, { status: 403 });
    }

    const requested: unknown = body?.sections;
    const sectionIds = Array.isArray(requested)
      ? (requested.filter((s) => TOGGLEABLE_SECTIONS.includes(s as ShareSectionId)) as ShareSectionId[])
      : [];
    if (!sectionIds.length) {
      return NextResponse.json(
        { error: 'Pick at least one section to share.' },
        { status: 400 },
      );
    }

    /**
     * Delegated token only. App-only cannot post an ordinary chatMessage, and a
     * post from an app identity reads as a bot in a class channel. Nexus's own
     * test, impersonation and parent tokens are not Microsoft's, so sending one
     * to Graph earns a 401 and a confusing log line. Say so plainly instead of
     * reporting a success that never happened.
     */
    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    if (!graphToken || /^(test_|imp_|par_)/.test(graphToken)) {
      return NextResponse.json(
        { error: 'Posting to Teams needs a Microsoft sign-in. Copy the message and paste it instead.' },
        { status: 400 },
      );
    }

    const payload = await assembleSharePayload(supabase, acc.cls, request);
    if (payload.state === 'cancelled') {
      return NextResponse.json({ error: 'A cancelled class has nothing to share.' }, { status: 409 });
    }
    if (!payload.teams.hasChannel && !payload.teams.hasGroupChat) {
      return NextResponse.json(
        { error: 'This classroom has no Teams channel or group chat. Copy the message and paste it instead.' },
        { status: 409 },
      );
    }

    const html = renderShareHtml(buildShareSections(payload), new Set(sectionIds));
    const wanted: string[] = Array.isArray(body?.targets) ? body.targets : ['channel', 'chat'];

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id, ms_group_chat_id')
      .eq('id', acc.cls.classroom_id)
      .single();

    const warnings: string[] = [];
    const patch: Record<string, unknown> = {};
    let channelId: string | null = null;
    let chatId: string | null = null;

    // ─── Channel ───
    if (wanted.includes('channel') && classroom?.ms_team_id) {
      const target =
        acc.cls.teams_channel_id || (await resolveMeetingChannelId(graphToken, classroom.ms_team_id));
      if (!target) {
        warnings.push('Could not find a channel to post in.');
      } else {
        const res = await postChannelMessageDetailed(graphToken, classroom.ms_team_id, target, html);
        if (isPostError(res)) {
          warnings.push(`Channel post failed. ${res.error}`);
        } else {
          channelId = res.id;
          if (res.id) patch.teams_share_message_id = res.id;
          // Stored so a later cancellation can soft-delete this card too.
          if (res.id && !acc.cls.teams_channel_id) patch.teams_channel_id = target;
        }
      }
    }

    // ─── Group chat ───
    if (wanted.includes('chat') && classroom?.ms_group_chat_id) {
      const res = await postChatMessageDetailed(graphToken, classroom.ms_group_chat_id, html);
      if (isPostError(res)) {
        warnings.push(`Group chat post failed. ${res.error}`);
      } else {
        chatId = res.id;
        if (res.id) patch.teams_share_chat_message_id = res.id;
      }
    }

    if (!channelId && !chatId) {
      return NextResponse.json(
        { error: warnings[0] || 'Nothing reached Teams.', warnings },
        { status: 502 },
      );
    }

    /**
     * No hash dedupe, deliberately, and this diverges from the neighbouring
     * refreshClassAnnouncement on purpose. That one fires automatically on every
     * wrap-up save, so five saves must not become five cards. This fires only
     * when a person taps a button, and a teacher re-sharing after attaching an
     * assignment MUST get a second card. The dialog guards the accidental case
     * with an in-flight disable and a "shared N minutes ago" note built from the
     * timestamp written here.
     */
    const postedAt = new Date().toISOString();
    patch.teams_share_posted_at = postedAt;
    patch.teams_share_posted_by = acc.userId;
    await supabase.from('nexus_scheduled_classes').update(patch).eq('id', acc.cls.id);

    return NextResponse.json({
      posted: { channel: channelId, chat: chatId },
      postedAt,
      warnings,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to post the class to Teams');
  }
}
