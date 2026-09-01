import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getAssignmentRoster,
  getAssignmentDrawingRoster,
  recordAssignmentReminder,
} from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { extractBearerToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import { shareBaseUrl } from '@/lib/class-share-links';
import { renderAssignmentShareHtml } from '@/lib/assignment-share-html';
import {
  splitPending,
  type AssignmentSharePayload,
  type AssignmentShareResponse,
  type SharePendingStudent,
} from '@/lib/assignment-share-model';
import {
  isPostError,
  postChannelMessageDetailed,
  postChatMessageDetailed,
} from '@/lib/teams-class-announcements';

/**
 * "Share this assignment": one link and one message a teacher can paste
 * anywhere, or post straight into the class Teams group tagging the students
 * who have not submitted.
 *
 * GET assembles the facts. POST renders them and sends them to Graph.
 *
 * Why a route rather than assembling in the page: the page already holds a
 * roster, but three things here cannot be trusted to or read from a browser.
 * The pending list must be re-derived server-side before anyone is tagged, the
 * classroom's Teams wiring needs the admin client, and the share slug is minted
 * here. The body a client sends carries CHOICES ONLY, never text and never a
 * list of student ids, which is the same rule the class share follows: no
 * client-supplied markup or recipient ever reaches Graph.
 *
 * Cost: one invocation per Share tap and one per post. Nothing runs on page
 * load, and the response is per-user and authorization-dependent, so it is
 * uncacheable by construction.
 */

interface Ctx {
  params: { id: string };
}

/** Columns the share needs. share_slug and teams_share_* are from 20260905090000. */
const SHARE_COLS =
  'id, classroom_id, title, status, assignment_type, due_at, evaluation_type, max_marks, share_slug, teams_share_posted_at';

interface ShareAssignmentRow {
  id: string;
  classroom_id: string;
  title: string | null;
  status: string | null;
  assignment_type: string | null;
  due_at: string | null;
  evaluation_type: string | null;
  max_marks: number | null;
  share_slug: string | null;
  teams_share_posted_at: string | null;
}

/**
 * The assignment, with a share slug guaranteed.
 *
 * Minted lazily rather than in the migration alone, so a row written by any
 * path that predates or bypasses the column default still gets one the first
 * time somebody tries to share it. Once minted it is never rotated: an old
 * Teams message must keep resolving.
 */
async function loadWithSlug(
  supabase: any,
  assignmentId: string,
): Promise<ShareAssignmentRow | null> {
  const { data } = await supabase
    .from('nexus_class_assignments')
    .select(SHARE_COLS)
    .eq('id', assignmentId)
    .maybeSingle();

  if (!data) return null;
  const row = data as ShareAssignmentRow;
  if (row.share_slug) return row;

  const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const { data: updated } = await supabase
    .from('nexus_class_assignments')
    .update({ share_slug: slug })
    .eq('id', assignmentId)
    // Only claim the slug if nobody else did between the read and the write.
    // A lost race is harmless: re-reading below picks up the winner's slug.
    .is('share_slug', null)
    .select('share_slug')
    .maybeSingle();

  return { ...row, share_slug: (updated as any)?.share_slug || slug };
}

/**
 * Who has not submitted, straight from the database.
 *
 * Drawing assignments keep their work in a different table, so they have their
 * own roster builder. Both expose a 'missing' bucket meaning the same thing,
 * and both already drop dormant and graduated students, which is what stops a
 * paused student being tagged in front of the class.
 */
async function loadPending(
  supabase: any,
  row: ShareAssignmentRow,
): Promise<{ pending: SharePendingStudent[]; submittedCount: number; totalCount: number }> {
  const isDrawing = row.assignment_type === 'drawing';
  const { rows } = isDrawing
    ? await getAssignmentDrawingRoster(row.id, supabase)
    : await getAssignmentRoster(row.id, supabase);

  const missing = (rows as Array<{ student: { id: string; name: string | null }; bucket: string }>)
    .filter((r) => r.bucket === 'missing')
    .map((r) => r.student);

  // ms_oid decides mention against bold text. Read in one query rather than per
  // student: a class of thirty would otherwise be thirty round trips.
  const oidById = new Map<string, string | null>();
  if (missing.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, ms_oid')
      .in(
        'id',
        missing.map((s) => s.id),
      );
    for (const u of (users as Array<{ id: string; ms_oid: string | null }>) || []) {
      oidById.set(u.id, u.ms_oid);
    }
  }

  return {
    pending: missing.map((s) => ({
      id: s.id,
      name: s.name || 'Student',
      oid: oidById.get(s.id) ?? null,
    })),
    submittedCount: rows.length - missing.length,
    totalCount: rows.length,
  };
}

/** Everything GET returns and POST re-derives. */
async function assemble(
  supabase: any,
  row: ShareAssignmentRow,
  request: NextRequest,
): Promise<{ payload: AssignmentSharePayload; classroom: any }> {
  const base = shareBaseUrl(request.nextUrl.origin);

  const [{ pending, submittedCount, totalCount }, classroomRes] = await Promise.all([
    loadPending(supabase, row),
    supabase
      .from('nexus_classrooms')
      .select('ms_team_id, ms_group_chat_id, ms_assignment_channel_id')
      .eq('id', row.classroom_id)
      .maybeSingle(),
  ]);

  return {
    payload: {
      assignmentId: row.id,
      title: row.title || 'Assignment',
      assignmentType: row.assignment_type === 'drawing' ? 'drawing' : 'document',
      dueAt: row.due_at,
      evaluationType: row.evaluation_type === 'stars' ? 'stars' : 'marks',
      maxMarks: row.max_marks,
      shareUrl: `${base}/a/${row.share_slug}`,
      pending,
      submittedCount,
      totalCount,
    },
    classroom: (classroomRes as any)?.data || null,
  };
}

/** GET /api/assignments/[id]/share   (staff with coord.nudge) */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    // The same capability that gates the catch-up nudge and this page's own
    // Message button. Sharing is the group-sized version of the same act.
    assertCapability(user, 'coord.nudge');

    const supabase = getSupabaseAdminClient() as any;
    const row = await loadWithSlug(supabase, params.id);
    if (!row) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const { payload, classroom } = await assemble(supabase, row, request);
    const { named } = splitPending(payload.pending);

    const body: AssignmentShareResponse = {
      ...payload,
      teams: {
        hasChannel: !!(classroom?.ms_team_id && classroom?.ms_assignment_channel_id),
        hasGroupChat: !!classroom?.ms_group_chat_id,
      },
      isDraft: row.status !== 'published',
      lastPostedAt: row.teams_share_posted_at,
      unmentionableCount: named.filter((s) => !s.oid).length,
    };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, 'Failed to build the assignment share');
  }
}

/**
 * POST /api/assignments/[id]/share   (staff with coord.nudge)
 * Body: { includeNames?: boolean, targets?: ('channel' | 'chat')[] }
 *
 * The body carries the teacher's choices and nothing else, ever. The message is
 * re-assembled from the database and re-rendered here, so no client HTML and no
 * client-supplied student list reaches Graph.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'coord.nudge');

    const body = await request.json().catch(() => ({}) as any);
    const includeNames = body?.includeNames !== false;
    const wanted: string[] = Array.isArray(body?.targets) ? body.targets : ['channel', 'chat'];

    const supabase = getSupabaseAdminClient() as any;
    const row = await loadWithSlug(supabase, params.id);
    if (!row) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    // A draft is hidden from students, so every student who tapped the link
    // would find nothing and ask the teacher why.
    if (row.status !== 'published') {
      return NextResponse.json(
        { error: 'Publish this assignment before sharing it. Students cannot open a draft.' },
        { status: 409 },
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
        {
          error:
            'Posting to Teams needs a Microsoft sign-in. Copy the message and paste it instead.',
        },
        { status: 400 },
      );
    }

    const { payload, classroom } = await assemble(supabase, row, request);

    const teamId: string | null = classroom?.ms_team_id || null;
    // The classroom's ASSIGNMENT channel, never resolveMeetingChannelId. An
    // assignment card must not land in the feed students read for "am I joining
    // a call right now". Unset means group chat only, which is a valid and
    // deliberate configuration rather than a reason to fall back.
    const channelId: string | null = classroom?.ms_assignment_channel_id || null;
    const chatId: string | null = classroom?.ms_group_chat_id || null;

    if (!(teamId && channelId) && !chatId) {
      return NextResponse.json(
        {
          error:
            'This classroom has no assignment channel or group chat. Copy the message and paste it instead.',
        },
        { status: 409 },
      );
    }

    const { html, mentions } = renderAssignmentShareHtml(payload, { includeNames });

    const warnings: string[] = [];
    const patch: Record<string, unknown> = {};
    let postedChannel: string | null = null;
    let postedChat: string | null = null;

    // ─── Assignment channel ───
    if (wanted.includes('channel') && teamId && channelId) {
      const res = await postChannelMessageDetailed(graphToken, teamId, channelId, html, mentions);
      if (isPostError(res)) warnings.push(`Channel post failed. ${res.error}`);
      else {
        postedChannel = res.id;
        if (res.id) patch.teams_share_message_id = res.id;
      }
    }

    // ─── Group chat ───
    if (wanted.includes('chat') && chatId) {
      const res = await postChatMessageDetailed(graphToken, chatId, html, mentions);
      if (isPostError(res)) warnings.push(`Group chat post failed. ${res.error}`);
      else {
        postedChat = res.id;
        if (res.id) patch.teams_share_chat_message_id = res.id;
      }
    }

    if (!postedChannel && !postedChat) {
      return NextResponse.json(
        { error: warnings[0] || 'Nothing reached Teams.', warnings },
        { status: 502 },
      );
    }

    /**
     * teams_share_posted_at, NOT teams_announced_at. That one records the
     * automatic publish card and guards it against re-posting; overwriting it
     * here would make the announce-once check think the assignment had never
     * been announced, and the next unrelated save would post the publish card
     * a second time.
     */
    const postedAt = new Date().toISOString();
    patch.teams_share_posted_at = postedAt;
    patch.teams_share_posted_by = user.id;
    await supabase.from('nexus_class_assignments').update(patch).eq('id', row.id);

    /**
     * Log the mention as a reminder.
     *
     * An @mention lands in that student's Teams activity feed, so they really
     * were reminded. The roster shows a "Reminded 2d ago, x2" hint built from
     * these rows, and leaving the group post out of it would understate what
     * the student received and lead staff to chase them again.
     *
     * Only the students actually tagged, and only when names were included.
     */
    if (includeNames && payload.pending.length > 0) {
      const { named } = splitPending(payload.pending);
      await Promise.all(
        named.map((s) =>
          recordAssignmentReminder({
            assignment_id: row.id,
            student_id: s.id,
            sent_by: user.id,
            channel: 'teams',
            template: 'share_group',
          }),
        ),
      );
    }

    return NextResponse.json({
      posted: { channel: postedChannel, chat: postedChat },
      postedAt,
      tagged: includeNames ? splitPending(payload.pending).named.length : 0,
      warnings,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to post the assignment to Teams');
  }
}
