import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getDrawingSharingOptOut, getFeatureOptOut, getLiveFeature, getPracticeDrawing,
  getSubmissionInspirationItemId, hasAnyLiveFeature, hideFeaturedSubmission, insertFeature,
  markUnfeatured, recordFlip, showFeaturedSubmission,
} from '@neram/database/queries/nexus';
import { assertCapability, getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent, realGraphToken, resolveSharedClassroom } from '@/lib/sketchbook-access';
import { featuredMessage, firstName } from '@/lib/sketchbook-messages';
import { sendNudge } from '@/lib/nudge-delivery';
import { prepareItemImage } from '@/lib/inspiration-images';
import {
  buildFeaturedSketchHtml, buildMentions, cardHash, isPostError, postChannelMessageDetailed,
  postChatMessageDetailed, removeTeamsAnnouncements, resolveMeetingChannelId,
} from '@/lib/teams-class-announcements';

// Two Graph posts, then an image fetch, a resize and a storage upload. The Next
// default would cut the last of those off half way.
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

function nexusBase(): string {
  return process.env.NEXT_PUBLIC_NEXUS_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://nexus.neramclasses.com';
}

/**
 * POST /api/sketchbook/entries/[id]/feature   body { classroom_id? }
 *
 * The only public claim this feature makes about a student, so it follows the
 * celebrate route's rules: the teacher's own delegated token (an app-only token
 * cannot post a chatMessage), the classroom re-checked against both the
 * teacher and the student, the student's opt-out honoured, and the card hash
 * stored so a retry never posts twice. Goes to BOTH the group chat and the
 * class channel (assignment channel, else the meeting channel), as decided with
 * the user on 2026-09-12.
 *
 * It now also puts the drawing on the Inspiration shelf, which is the point of
 * featuring and was the half that was missing: the work a teacher singled out
 * was the one work no student could go back and find. That write happens AFTER
 * Teams, with everything else, so a Graph failure still records nothing.
 *
 * `moderate.gallery` sits in SHARED_STAFF (staff-capabilities.ts), so a
 * visiting teacher already holds it; the enrollment overlap checks below are
 * what actually restrict which classroom and which student they may feature.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'moderate.gallery');
    const token = realGraphToken(request.headers.get('Authorization'));

    const body = await request.json().catch(() => ({}));
    const requested = typeof body?.classroom_id === 'string' ? body.classroom_id : '';

    // Practice drawings of any kind (sketch, question bank, free practice), never owed work.
    const sketch = await getPracticeDrawing(params.id);
    if (!sketch) throw new ApiError('Drawing not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    const classroomId = await resolveSharedClassroom(caller, sketch.student_id, requested);
    if (await getFeatureOptOut(sketch.student_id)) {
      throw new ApiError('This student has asked not to be featured.', 409);
    }
    if (await getLiveFeature(sketch.id, classroomId)) {
      throw new ApiError('Already featured in this classroom.', 409);
    }
    // Two different opt-outs. The class Teams post is the audience the student
    // already sits in; the Inspiration shelf is every student in Nexus, so only
    // this second, wider step is gated by the drawing-sharing choice. The RPC
    // would hide it anyway; refusing here is what lets the teacher be told.
    const onShelf = !(await getDrawingSharingOptOut(sketch.student_id));
    const itemId = onShelf ? await getSubmissionInspirationItemId(sketch.id) : null;

    const supabase = getSupabaseAdminClient();
    // `ms_assignment_channel_id` predates the generated types regenerating for
    // this table (same drift teams-group-post.ts and classrooms/[id]/route.ts
    // work around), so only this one query chain is cast; the `users` select
    // and the later `drawing_submissions` updates stay on the typed client.
    const [{ data: classroom, error: classroomError }, { data: student, error: studentError }] = await Promise.all([
      (supabase as any).from('nexus_classrooms').select('id, name, ms_team_id, ms_channel_id, ms_group_chat_id, ms_assignment_channel_id').eq('id', classroomId).maybeSingle(),
      supabase.from('users').select('id, name, ms_oid').eq('id', sketch.student_id).maybeSingle(),
    ]);
    if (classroomError) throw classroomError;
    if (studentError) throw studentError;
    if (!classroom) throw new ApiError('Classroom not found', 404);
    const studentName = (student as { name?: string | null } | null)?.name || 'A student';

    // The card is read in a group chat of forty two students and six staff, so
    // the link goes where a student can follow it. It used to point at
    // /teacher/sketchbook, which locked out almost everyone who was shown the
    // message. When there is no shelf page to send them to, because the student
    // keeps their drawings private or the sync never made an item, the card
    // carries no link at all: the builder drops anything that is not https, and
    // a link most readers cannot open is worse than none.
    const nexusUrl = itemId ? `${nexusBase()}/student/inspiration/${itemId}` : '';
    // No caption. It used to default to the student's self_note, which the
    // teacher at least saw in the box before sending. With the box gone, that
    // fallback would post a private reflection to forty two classmates with
    // nobody reading it first. The sync function refuses to copy self_note for
    // exactly this reason ("the student's private reflection",
    // 20260920090100_nexus_inspiration_sync.sql), and so do we. The card says
    // who drew it and shows the drawing, which is the whole point.
    const body_html = buildFeaturedSketchHtml({ studentName, imageUrl: sketch.original_image_url, nexusUrl });
    const { html: mentionHtml, mentions } = buildMentions([{ oid: (student as { ms_oid?: string | null } | null)?.ms_oid, displayName: studentName }]);
    // The @-mention is what actually pings the student in the channel, so it
    // carries the congratulation rather than a second, flatter line.
    const html = `${body_html}<p>Well done, ${mentionHtml}.</p>`;

    // Teams first, then the row, so a Graph failure never records a feature that never posted.
    const teams = { channel: false, chat: false, errors: [] as string[] };
    let channelId: string | null = null;
    let channelMessageId: string | null = null;
    let chatMessageId: string | null = null;
    const c = classroom as { ms_team_id: string | null; ms_channel_id: string | null; ms_group_chat_id: string | null; ms_assignment_channel_id: string | null };
    if (c.ms_team_id) {
      channelId = c.ms_assignment_channel_id || c.ms_channel_id || (await resolveMeetingChannelId(token, c.ms_team_id));
      if (channelId) {
        const r = await postChannelMessageDetailed(token, c.ms_team_id, channelId, html, mentions);
        if (isPostError(r)) teams.errors.push(`channel: ${r.error}`); else { teams.channel = true; channelMessageId = r.id; }
      }
      if (!channelId) teams.errors.push('channel: no channel could be resolved for this team');
    }
    if (c.ms_group_chat_id) {
      const r = await postChatMessageDetailed(token, c.ms_group_chat_id, html, mentions);
      if (isPostError(r)) teams.errors.push(`chat: ${r.error}`); else { teams.chat = true; chatMessageId = r.id; }
    }
    if (!c.ms_team_id && !c.ms_group_chat_id) teams.errors.push('This classroom has no Teams channel or group chat.');

    const feature = await insertFeature({
      submission_id: sketch.id,
      classroom_id: classroomId,
      featured_by: caller.id,
      caption: null,
      teams_channel_id: channelId,
      teams_channel_message_id: channelMessageId,
      teams_group_chat_message_id: chatMessageId,
      card_hash: cardHash(html),
    });
    const { error: visibleError } = await supabase.from('drawing_submissions').update({ is_gallery_visible: true }).eq('id', sketch.id);
    if (visibleError) throw visibleError;
    await recordFlip(caller.id, sketch.id, 'seen');

    // On to the shelf. Best effort on purpose: the drawing is featured and the
    // class has already been told, so a failure here is a missing row to repair,
    // never a reason to fail a post that has gone out and cannot be recalled.
    let shelved = false;
    if (onShelf) {
      try {
        const item = await showFeaturedSubmission(sketch.id, caller.id, 'Sketchbook drawing');
        shelved = !!item;
        // The grid sets each tile's aspect ratio before the image loads so it
        // never jumps, and a sketch's item row is written by the sync trigger
        // with neither shape nor thumbnail. Measure it here rather than copying
        // the submission's: the sync migration leaves these null on purpose,
        // because the submission's pair can predate a rotation and an item
        // keeps its own only while image_url is unchanged.
        //
        // Inline, and last, because the student is being told right now to go
        // and look. The maintenance route stays the safety net: this row is
        // visible from here, so listItemsNeedingImages will pick it up if the
        // measurement below fails.
        if (item && (!item.thumbnail_url || !item.image_aspect)) {
          await prepareItemImage(item);
        }
      } catch (err) {
        console.error('[feature] could not put the drawing on the Inspiration shelf', err);
      }
    }

    const msg = featuredMessage(firstName(caller.name), (classroom as { name: string }).name, shelved);
    await sendNudge({
      // The teacher's own Teams chat (their connected login if this token cannot chat).
      teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
      studentIds: [sketch.student_id],
      subject: msg.subject,
      plain: msg.plain,
      teamsText: msg.teamsText,
      eventType: 'sketch_featured',
      // inspiration_item_id sends the student to the shelf where their drawing
      // is now being looked at, rather than back to their own sketchbook.
      metadata: {
        submission_id: sketch.id,
        classroom_id: classroomId,
        source: 'sketchbook',
        ...(shelved && itemId ? { inspiration_item_id: itemId } : {}),
      },
      respectDormancy: false,
    });

    return NextResponse.json({ feature, teams, shelved }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not feature the sketch');
  }
}

/** DELETE /api/sketchbook/entries/[id]/feature?classroom=<id>   (staff, delegated token) */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'moderate.gallery');
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const sketch = await getPracticeDrawing(params.id);
    if (!sketch) throw new ApiError('Drawing not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    const live = await getLiveFeature(sketch.id, classroomId);
    if (!live) throw new ApiError('Not featured in this classroom.', 404);

    let failures: string[] = [];
    if (live.teams_channel_message_id || live.teams_group_chat_message_id) {
      const token = realGraphToken(request.headers.get('Authorization'));
      const result = await removeTeamsAnnouncements(token, getSupabaseAdminClient(), classroomId, {
        teams_channel_id: live.teams_channel_id,
        teams_channel_message_id: live.teams_channel_message_id,
        teams_group_chat_message_id: live.teams_group_chat_message_id,
      });
      failures = result.failures;
    }
    await markUnfeatured(live.id);
    if (!(await hasAnyLiveFeature(sketch.id))) {
      const { error: hiddenError } = await getSupabaseAdminClient().from('drawing_submissions').update({ is_gallery_visible: false }).eq('id', sketch.id);
      if (hiddenError) throw hiddenError;
      // Off the shelf too, but only once no classroom still features it.
      // Back to 'auto', never 'hidden': a sketch is invisible under the
      // automatic rule anyway, while an assignment drawing rated four stars or
      // more returns to being shown by the rule that put it there before anyone
      // featured it. See hideFeaturedSubmission.
      await hideFeaturedSubmission(sketch.id, caller.id);
    }
    return NextResponse.json({ ok: true, failures }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not un-feature the sketch');
  }
}
