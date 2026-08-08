import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { loadAllClearStudents } from '@/lib/catchup-cohort';
import {
  buildMentions,
  escapeMessageHtml,
  isPostError,
  postChannelMessageDetailed,
  postChatMessageDetailed,
  resolveMeetingChannelId,
} from '@/lib/teams-class-announcements';

/**
 * POST /api/catchup/celebrate   (staff)
 * body { classroomId, studentIds?, message?, postToTeams?: 'both'|'channel'|'chat' }
 *
 * Name the students who have nothing left to catch up on, in the class Teams
 * channel.
 *
 * This is the only outbound message in Nexus that is purely good news, and it is
 * built to a stricter rule than the nudge next door for one reason: a nudge sent
 * to the wrong person is an awkward message, and a celebration sent about the
 * wrong person is a public claim about them in front of their whole batch.
 *
 * So the recipient list is never taken from the browser. `studentIds` narrows
 * what the teacher selected; it can never widen it. Every name that reaches
 * Teams was re-derived here, this second, from the same rule the teacher's
 * screen renders (lib/catchup-cohort.ts), and anybody in the request who is not
 * clear right now is dropped in silence rather than argued about.
 *
 * There is no cron version of this on purpose. A Teams channel post needs a
 * delegated Microsoft token from the person pressing the button; an app-only
 * token cannot send an ordinary chatMessage at all. Beyond the mechanics, the
 * wording of a message that praises children by name should have a human behind
 * it.
 */

/** One press cannot become a broadcast to a school. */
const MAX_NAMES = 100;

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const { data: staff } = await supabase
      .from('users')
      .select('id, name, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.nudge')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const classroomId: string | null =
      typeof body?.classroomId === 'string' ? body.classroomId : null;
    if (!classroomId) return NextResponse.json({ error: 'Missing classroomId' }, { status: 400 });

    const want = String(body?.postToTeams || 'both');
    if (!['both', 'channel', 'chat'].includes(want)) {
      return NextResponse.json({ error: 'Nowhere to post' }, { status: 400 });
    }

    // The delegated token check comes before the work. Deriving the cohort is
    // several queries, and there is no point spending them to discover we cannot
    // post at all. Nexus's own test, impersonation and parent tokens are not
    // Microsoft's, so handing one to Graph earns a 401 and a confusing log line.
    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    if (!graphToken || /^(test_|imp_|par_)/.test(graphToken)) {
      return NextResponse.json(
        { error: 'Posting to Teams needs a Microsoft sign-in.' },
        { status: 400 },
      );
    }

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('id, name, ms_team_id, ms_group_chat_id')
      .eq('id', classroomId)
      .maybeSingle();
    if (!classroom) {
      return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
    }
    if (!classroom.ms_team_id && !classroom.ms_group_chat_id) {
      return NextResponse.json(
        { error: 'This classroom has no Teams channel or group chat to post in.' },
        { status: 400 },
      );
    }

    // ── Re-derived, never trusted ────────────────────────────────────────────
    const allClear = await loadAllClearStudents(supabase, classroomId);

    const narrowTo: Set<string> | null = Array.isArray(body?.studentIds)
      ? new Set(body.studentIds.filter((x: any) => typeof x === 'string'))
      : null;

    // Intersection, so the selection can only ever remove people.
    const named = (narrowTo ? allClear.filter((s) => narrowTo.has(s.id)) : allClear).slice(
      0,
      MAX_NAMES,
    );

    if (named.length === 0) {
      return NextResponse.json(
        { error: 'Nobody in this classroom is completely clear right now.' },
        { status: 400 },
      );
    }

    const { data: people } = await supabase
      .from('users')
      .select('id, name, ms_oid')
      .in(
        'id',
        named.map((s) => s.id),
      );
    const oidById = new Map<string, string | null>(
      (people || []).map((u: any) => [u.id, u.ms_oid]),
    );

    // buildMentions degrades a student with no ms_oid to bold text rather than
    // dropping them, which is what we want here: a Google-only enrolment still
    // gets their name read out, they simply do not get the ping.
    const mentioned = buildMentions(
      named.map((s) => ({
        oid: oidById.get(s.id) ?? null,
        displayName: s.name || s.email || 'Student',
      })),
    );

    const custom = String(body?.message || '').trim();
    const headline =
      named.length === 1
        ? 'One of you is completely caught up'
        : `${named.length} of you are completely caught up`;

    // No counts about anybody else, and no mention of who is behind. The whole
    // point of this message is that it can be read by the students it does not
    // name without carrying anything about them.
    const closing =
      custom ||
      'Nothing left on their catch-up list. If you have a class waiting, this is a good week to clear it.';

    const html =
      `<p><b>&#127881; ${escapeMessageHtml(headline)}</b></p>` +
      `<p>${mentioned.html}</p>` +
      `<p>${escapeMessageHtml(closing)}</p>`;

    const teamsPost: { channel: boolean; chat: boolean; error?: string | null } = {
      channel: false,
      chat: false,
      error: null,
    };
    const failures: string[] = [];

    if ((want === 'both' || want === 'channel') && classroom.ms_team_id) {
      const channelId = await resolveMeetingChannelId(graphToken, classroom.ms_team_id);
      if (!channelId) failures.push('Could not find a channel to post in.');
      else {
        const res = await postChannelMessageDetailed(
          graphToken,
          classroom.ms_team_id,
          channelId,
          html,
          mentioned.mentions,
        );
        if (isPostError(res)) failures.push(res.error);
        else teamsPost.channel = true;
      }
    }

    if ((want === 'both' || want === 'chat') && classroom.ms_group_chat_id) {
      const res = await postChatMessageDetailed(
        graphToken,
        classroom.ms_group_chat_id,
        html,
        mentioned.mentions,
      );
      if (isPostError(res)) failures.push(res.error);
      else teamsPost.chat = true;
    }

    if (!teamsPost.channel && !teamsPost.chat) {
      teamsPost.error =
        failures[0] || 'This classroom has no Teams channel or group chat to post in.';
      // `error` as well as `teamsPost.error`, because useAuthFetch throws on a
      // non-2xx and reads `payload.error` for the message. Without it the
      // teacher is told "Request failed" while the real cause sits one key over.
      return NextResponse.json(
        { ok: false, error: teamsPost.error, teamsPost, named: [] },
        { status: 502 },
      );
    }

    // The names are echoed back because the server decides them. A teacher who
    // selected eight and sees seven here has been told that one of them cleared
    // something, or did not, since the page last loaded.
    return NextResponse.json({
      ok: true,
      teamsPost,
      named: named.map((s) => s.name || s.email || 'Student'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to post the celebration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
