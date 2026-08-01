import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { sendNudge, plainToHtml } from '@/lib/nudge-delivery';
import { emailParentsOfStudents } from '@/lib/parent-notify';
import {
  buildMentions,
  escapeMessageHtml,
  isPostError,
  postChannelMessageDetailed,
  postChatMessageDetailed,
  resolveMeetingChannelId,
} from '@/lib/teams-class-announcements';

/**
 * POST /api/timetable/[classId]/catchup-nudge   (staff)
 * body { classroom_id, studentIds, message?, postToTeams?: 'both'|'channel'|'chat'|'none' }
 *
 * Ask a named set of students to catch up on ONE named class.
 *
 * The catch-up nudge that already existed sends "You have classes waiting on
 * your catch-up list" and nothing more. It never says which class, so a student
 * with two outstanding cannot tell what is being asked and a teacher watching
 * the button cannot tell that anything happened at all. This one names the
 * class, its date, and what to do about it.
 *
 * The three things it does, in the order they matter:
 *
 *  1. Messages each student through sendNudge, the single delivery choke point
 *     (Teams activity feed, in-app row, email only when Teams did not land, and
 *     dormant students filtered out).
 *  2. Stamps followup_sent_at on the absence rows, which is what lets the panel
 *     show "last nudged 28 Jul" and what makes the SECOND nudge different from
 *     the first.
 *  3. On a second nudge, emails the parent. First time is between the teacher
 *     and the student; a repeat means the student has not responded, and that is
 *     the point at which a guardian should hear about it.
 *
 * Optionally posts in the class Teams channel and group chat, @-mentioning each
 * student, so it also lands in their Teams activity feed and the batch can see
 * the class is still open.
 *
 * The nightly cron deliberately sends none of this: see api/cron/class-followups
 * for why a machine messaging thirty teenagers at 9 PM is the wrong default.
 * This route is the human pressing send.
 */

/** One request cannot turn into a mail run. */
const MAX_RECIPIENTS = 100;

export async function POST(request: NextRequest, { params }: { params: { classId: string } }) {
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
    const classroomId: string | null = typeof body?.classroom_id === 'string' ? body.classroom_id : null;
    const requested: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: any) => typeof x === 'string').slice(0, MAX_RECIPIENTS)
      : [];

    if (!classroomId) return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    if (requested.length === 0) {
      return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    }

    // Class-in-classroom, so a mismatched pair cannot address a roster somewhere
    // else. Same guard as attendance-report.
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, classroom_id, teams_channel_id')
      .eq('id', params.classId)
      .eq('classroom_id', classroomId)
      .maybeSingle();

    if (!cls) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    // NEVER trust the client's id list. This is the same re-check manual_mark
    // performs, and it is the only thing between a hand-crafted payload and a
    // message sent to a student in another classroom.
    const { data: enrolled } = await supabase
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .in('user_id', requested);

    const studentIds = (enrolled || []).map((e: any) => e.user_id);
    if (studentIds.length === 0) {
      return NextResponse.json(
        { error: 'None of those students are enrolled in this classroom.' },
        { status: 400 },
      );
    }

    const { data: people } = await supabase
      .from('users')
      .select('id, name, ms_oid')
      .in('id', studentIds);
    const nameById = new Map<string, string | null>((people || []).map((u: any) => [u.id, u.name]));

    const dateLabel = new Date(`${cls.scheduled_date}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const title = cls.title || 'the class';

    // Who has been chased about THIS class before. Read before the stamp below,
    // because after it everyone looks like a repeat.
    const { data: absencesBefore } = await supabase
      .from('nexus_class_absences')
      .select('student_id, followup_sent_at')
      .eq('scheduled_class_id', cls.id)
      .in('student_id', studentIds);

    const alreadyChased = new Set<string>(
      (absencesBefore || []).filter((a: any) => a.followup_sent_at).map((a: any) => a.student_id),
    );

    const custom = String(body?.message || '').trim();
    const plain =
      custom ||
      `You missed ${title} on ${dateLabel}. Watch the recording in Nexus and take the short check so it clears from your catch-up list.`;
    const subject = `Catch up: ${title}`;

    const { results, counts } = await sendNudge({
      studentIds,
      subject,
      plain,
      html: plainToHtml(plain),
      teamsText: subject,
      eventType: 'catchup_behind_pace',
      metadata: { sent_by: staff.id, scheduled_class_id: cls.id, source: 'class_attendance' },
    });

    // Stamp the absence rows. Nothing wrote these from a human path before, so
    // "last nudged" had no source and a teacher could not tell a first chase
    // from a fifth. Only rows that exist are touched: a student with no absence
    // row was not recorded as missing this class, and inventing one here would
    // put them on a catch-up list the register never placed them on.
    const now = new Date().toISOString();
    const { error: stampError } = await supabase
      .from('nexus_class_absences')
      .update({ followup_sent_at: now, followup_sent_by: staff.id })
      .eq('scheduled_class_id', cls.id)
      .in('student_id', studentIds);
    // Checked rather than discarded: PostgREST hands back { error } instead of
    // throwing, and an unwritten stamp means every nudge looks like the first
    // one forever, which silently disables the parent escalation below.
    if (stampError) console.error('[catchup-nudge] could not stamp followups:', stampError.message);

    // ── Parents, on the second nudge only ──
    let parents = { emailed: 0, errors: [] as string[] };
    const repeatIds = studentIds.filter((id: string) => alreadyChased.has(id));
    if (repeatIds.length > 0) {
      const run = await emailParentsOfStudents({
        studentIds: repeatIds,
        nameById,
        client: supabase,
        build: (childNames) => {
          if (childNames.length === 0) return null;
          const who = childNames.join(' and ');
          return {
            subject: `${who} still has a class to catch up on`,
            plain: [
              `${who} missed ${title} on ${dateLabel} and has not caught up on it yet.`,
              '',
              'They have been reminded in Nexus and on Teams. Catching up means watching the recording and taking a short check, which takes about twenty minutes.',
              '',
              'You can see where they are up to in the parent portal.',
            ].join('\n'),
          };
        },
      });
      parents = { emailed: run.sent, errors: run.errors };
    }

    // ── The Teams post ──
    const want = String(body?.postToTeams || 'none');
    const teamsPost: { channel: boolean; chat: boolean; error?: string | null } = {
      channel: false,
      chat: false,
      error: null,
    };

    if (want !== 'none') {
      // Delegated token only. App-only cannot post an ordinary chatMessage, and
      // a post from an app identity reads as a bot in a class channel. Nexus's
      // own test, impersonation and parent tokens are not Microsoft's, so
      // sending one to Graph earns a 401 and a confusing log line.
      const graphToken = extractBearerToken(request.headers.get('Authorization'));
      if (!graphToken || /^(test_|imp_|par_)/.test(graphToken)) {
        teamsPost.error = 'Posting to Teams needs a Microsoft sign-in.';
      } else {
        const { data: classroom } = await supabase
          .from('nexus_classrooms')
          .select('ms_team_id, ms_group_chat_id')
          .eq('id', classroomId)
          .single();

        const mentioned = buildMentions(
          studentIds.map((id: string) => {
            const u = (people || []).find((p: any) => p.id === id);
            return { oid: u?.ms_oid ?? null, displayName: u?.name || 'Student' };
          }),
        );

        const html =
          `<p><b>Catch up: ${escapeMessageHtml(title)}</b><br/>${escapeMessageHtml(dateLabel)}</p>` +
          `<p>${mentioned.html}</p>` +
          `<p>${escapeMessageHtml(plain)}</p>`;

        const failures: string[] = [];

        if ((want === 'both' || want === 'channel') && classroom?.ms_team_id) {
          const channelId =
            cls.teams_channel_id || (await resolveMeetingChannelId(graphToken, classroom.ms_team_id));
          if (!channelId) {
            failures.push('Could not find a channel to post in.');
          } else {
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

        if ((want === 'both' || want === 'chat') && classroom?.ms_group_chat_id) {
          const res = await postChatMessageDetailed(
            graphToken,
            classroom.ms_group_chat_id,
            html,
            mentioned.mentions,
          );
          if (isPostError(res)) failures.push(res.error);
          else teamsPost.chat = true;
        }

        // Reported, never thrown. The students have already been messaged by the
        // time we get here, so a failed channel post must not read as a failed
        // send: the teacher would press it again and everyone would be nudged twice.
        if (!teamsPost.channel && !teamsPost.chat) {
          teamsPost.error =
            failures[0] || 'This classroom has no Teams channel or group chat to post in.';
        }
      }
    }

    return NextResponse.json({
      ok: true,
      class: { id: cls.id, title, scheduled_date: cls.scheduled_date },
      counts,
      results,
      parents,
      teamsPost,
      /** How many of these were being chased for a second or later time. */
      repeats: repeatIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
