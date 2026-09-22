import { NextRequest, NextResponse } from 'next/server';
import { addDrawingSubmissionComment, getPracticeDrawing, recordFlip, setSketchbookReaction } from '@neram/database/queries/nexus';
import type { SketchbookReaction } from '@neram/database/types';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { firstName, reactionMessage } from '@/lib/sketchbook-messages';
import { sendNudge } from '@/lib/nudge-delivery';

const REACTIONS: SketchbookReaction[] = ['heart', 'fire', 'wow'];
const COMMENT_MAX = 300;

// Flip through no longer waits on this route (it answers the teacher at once and
// sends in the background), but the Teams chat chain inside sendNudge still has
// to finish inside one invocation.
export const maxDuration = 30;

/**
 * POST /api/sketchbook/entries/[id]/react
 * body { reaction?: 'heart' | 'fire' | 'wow' | null, comment?: string }   (staff)
 *
 * One reaction per sketch (the column is single-valued, like assignment
 * grading). Null clears it. Leaving `reaction` out with a comment sends the
 * comment on its own and keeps whatever reaction the sketch already has. A
 * comment rides the existing comment thread. The student is told through
 * sendNudge; respectDormancy is false because the student asked for this by
 * uploading.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : '';
    const commentOnly = body?.reaction === undefined && comment !== '';
    const asked = body?.reaction === null ? null : (REACTIONS.includes(body?.reaction) ? (body.reaction as SketchbookReaction) : undefined);
    if (asked === undefined && !commentOnly) throw new ApiError('reaction must be heart, fire, wow or null', 400);

    // Practice drawings of any kind (sketch, question bank, free practice), never owed work.
    const sketch = await getPracticeDrawing(params.id);
    if (!sketch) throw new ApiError('Drawing not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);

    const reaction: SketchbookReaction | null = commentOnly ? (sketch.reaction as SketchbookReaction | null) ?? null : (asked as SketchbookReaction | null);
    if (!commentOnly) await setSketchbookReaction(sketch.id, reaction);
    await recordFlip(caller.id, sketch.id, 'seen');
    if (comment) {
      await addDrawingSubmissionComment({ submission_id: sketch.id, author_id: caller.id, author_role: 'teacher', comment_text: comment });
    }

    const changed = !commentOnly && reaction !== null && reaction !== sketch.reaction;
    if (changed || comment) {
      const who = firstName(caller.name);
      const msg = changed && reaction ? reactionMessage(who, reaction) : { subject: `${who} commented on your sketch`, plain: comment };
      await sendNudge({
        // The teacher's own Teams chat (their connected login if this token cannot chat).
        teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
        studentIds: [sketch.student_id],
        subject: msg.subject,
        plain: comment && changed ? `${msg.plain} ${who} wrote: ${comment}` : msg.plain,
        eventType: 'sketch_reaction',
        metadata: { submission_id: sketch.id, reaction, source: 'sketchbook' },
        respectDormancy: false,
      });
    }
    return NextResponse.json({ reaction }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not save the reaction');
  }
}
