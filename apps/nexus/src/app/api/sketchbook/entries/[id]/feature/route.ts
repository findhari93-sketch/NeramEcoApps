import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getFeatureOptOut, getLiveFeature, getSketchbookSketch, hasAnyLiveFeature, insertFeature,
  listUserClassroomIds, markUnfeatured, recordFlip,
} from '@neram/database/queries/nexus';
import { assertCapability, getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent, realGraphToken, staffClassroomIds } from '@/lib/sketchbook-access';
import { featuredMessage, firstName } from '@/lib/sketchbook-messages';
import { sendNudge } from '@/lib/nudge-delivery';
import {
  buildFeaturedSketchHtml, buildMentions, cardHash, isPostError, postChannelMessageDetailed,
  postChatMessageDetailed, removeTeamsAnnouncements, resolveMeetingChannelId,
} from '@/lib/teams-class-announcements';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CAPTION_MAX = 120;

function nexusBase(): string {
  return process.env.NEXT_PUBLIC_NEXUS_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://nexus.neramclasses.com';
}

/**
 * POST /api/sketchbook/entries/[id]/feature   body { classroom_id, caption? }
 *
 * The only public claim this feature makes about a student, so it follows the
 * celebrate route's rules: the teacher's own delegated token (an app-only token
 * cannot post a chatMessage), the classroom re-checked against both the
 * teacher and the student, the student's opt-out honoured, and the card hash
 * stored so a retry never posts twice. Goes to BOTH the group chat and the
 * class channel (assignment channel, else the meeting channel), as decided with
 * the user on 2026-09-12.
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
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : '';
    if (!classroomId) throw new ApiError('Missing classroom_id', 400);
    const caption = typeof body?.caption === 'string' ? body.caption.trim().slice(0, CAPTION_MAX) : '';

    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    const [mine, theirs] = await Promise.all([staffClassroomIds(caller), listUserClassroomIds(sketch.student_id, 'student')]);
    if (!mine.includes(classroomId) || !theirs.includes(classroomId)) {
      throw new ApiError('That classroom does not hold both of you.', 403);
    }
    if (await getFeatureOptOut(sketch.student_id)) {
      throw new ApiError('This student has asked not to be featured.', 409);
    }
    if (await getLiveFeature(sketch.id, classroomId)) {
      throw new ApiError('Already featured in this classroom.', 409);
    }

    // `ms_assignment_channel_id` predates the generated types regenerating for
    // this table (same drift teams-group-post.ts and classrooms/[id]/route.ts
    // work around), so the client is cast here rather than typed against a
    // column tsc does not yet know about.
    const supabase = getSupabaseAdminClient() as any;
    const [{ data: classroom, error: classroomError }, { data: student, error: studentError }] = await Promise.all([
      supabase.from('nexus_classrooms').select('id, name, ms_team_id, ms_channel_id, ms_group_chat_id, ms_assignment_channel_id').eq('id', classroomId).maybeSingle(),
      supabase.from('users').select('id, name, ms_oid').eq('id', sketch.student_id).maybeSingle(),
    ]);
    if (classroomError) throw classroomError;
    if (studentError) throw studentError;
    if (!classroom) throw new ApiError('Classroom not found', 404);
    const studentName = (student as { name?: string | null } | null)?.name || 'A student';

    const nexusUrl = `${nexusBase()}/teacher/sketchbook/${sketch.student_id}/${sketch.id}`;
    const body_html = buildFeaturedSketchHtml({ studentName, caption: caption || sketch.self_note, imageUrl: sketch.original_image_url, nexusUrl });
    const { html: mentionHtml, mentions } = buildMentions([{ oid: (student as { ms_oid?: string | null } | null)?.ms_oid, displayName: studentName }]);
    const html = `${body_html}<p>Drawn by ${mentionHtml}</p>`;

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
      caption: caption || null,
      teams_channel_id: channelId,
      teams_channel_message_id: channelMessageId,
      teams_group_chat_message_id: chatMessageId,
      card_hash: cardHash(html),
    });
    const { error: visibleError } = await supabase.from('drawing_submissions').update({ is_gallery_visible: true }).eq('id', sketch.id);
    if (visibleError) throw visibleError;
    await recordFlip(caller.id, sketch.id, 'seen');

    const msg = featuredMessage(firstName(caller.name), (classroom as { name: string }).name);
    await sendNudge({
      studentIds: [sketch.student_id],
      subject: msg.subject,
      plain: msg.plain,
      eventType: 'sketch_featured',
      metadata: { submission_id: sketch.id, classroom_id: classroomId, source: 'sketchbook' },
      respectDormancy: false,
    });

    return NextResponse.json({ feature, teams }, { status: 201, headers: NO_STORE });
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
    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
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
    }
    return NextResponse.json({ ok: true, failures }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not un-feature the sketch');
  }
}
