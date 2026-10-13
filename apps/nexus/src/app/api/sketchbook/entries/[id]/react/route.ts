import { NextRequest, NextResponse } from 'next/server';
import { addDrawingSubmissionComment, getPracticeDrawing, isDrawingGrade, recordFlip, savePracticeEvaluation } from '@neram/database/queries/nexus';
import type { DrawingGrade, SketchbookReaction } from '@neram/database/types';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { evaluationMessage, firstName } from '@/lib/sketchbook-messages';
import { sendNudge } from '@/lib/nudge-delivery';

const REACTIONS: SketchbookReaction[] = ['heart', 'fire', 'wow'];
const COMMENT_MAX = 300;

// Flip through no longer waits on this route (it answers the teacher at once and
// sends in the background), but the Teams chat chain inside sendNudge still has
// to finish inside one invocation.
export const maxDuration = 30;

const has = (body: unknown, key: string) => !!body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, key);

/**
 * POST /api/sketchbook/entries/[id]/react
 * body { grade?: 'top' | 'mid' | 'needs_practice' | null, reaction?: 'heart' | 'fire' | 'wow' | null, comment?: string }   (staff)
 *
 * One save from Flip through: a grade, a reaction and a comment, any of them.
 * A field left out stays as it is; null clears it. The drawing is evaluated
 * once it has a grade and a reaction (savePracticeEvaluation keeps evaluated_at
 * true to that). A comment rides the existing comment thread. The student gets
 * ONE message built from what changed, through sendNudge; respectDormancy is
 * false because the student asked for this by uploading.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : '';

    let reaction: SketchbookReaction | null | undefined;
    if (has(body, 'reaction')) {
      if (body.reaction !== null && !REACTIONS.includes(body.reaction)) throw new ApiError('reaction must be heart, fire, wow or null', 400);
      reaction = body.reaction;
    }
    let grade: DrawingGrade | null | undefined;
    if (has(body, 'grade')) {
      if (body.grade !== null && !isDrawingGrade(body.grade)) throw new ApiError('grade must be top, mid, needs_practice or null', 400);
      grade = body.grade;
    }
    if (reaction === undefined && grade === undefined && !comment) throw new ApiError('Send a grade, a reaction or a comment', 400);

    // Practice drawings of any kind (sketch, question bank, free practice), never owed work.
    const sketch = await getPracticeDrawing(params.id);
    if (!sketch) throw new ApiError('Drawing not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);

    const saved = reaction !== undefined || grade !== undefined
      ? await savePracticeEvaluation(sketch, { reaction, grade }, caller.id)
      : { reaction: (sketch.reaction as SketchbookReaction | null) ?? null, drawing_grade: sketch.drawing_grade ?? null, evaluated_at: sketch.evaluated_at ?? null };
    await recordFlip(caller.id, sketch.id, 'seen');
    if (comment) {
      await addDrawingSubmissionComment({ submission_id: sketch.id, author_id: caller.id, author_role: 'teacher', comment_text: comment });
    }

    // Taking a reaction or a grade away is not news; giving or changing one is.
    const newReaction = reaction && reaction !== sketch.reaction ? reaction : undefined;
    const newGrade = grade && grade !== (sketch.drawing_grade ?? null) ? grade : undefined;
    if (newReaction || newGrade || comment) {
      const msg = evaluationMessage(firstName(caller.name), { reaction: newReaction, grade: newGrade, comment: comment || undefined });
      await sendNudge({
        // The teacher's own Teams chat (their connected login if this token cannot chat).
        teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
        studentIds: [sketch.student_id],
        subject: msg.subject,
        plain: msg.plain,
        eventType: 'sketch_reaction',
        metadata: { submission_id: sketch.id, reaction: saved.reaction, grade: saved.drawing_grade, source: 'sketchbook' },
        respectDormancy: false,
      });
    }
    return NextResponse.json(
      { reaction: saved.reaction, grade: saved.drawing_grade, evaluated: !!saved.evaluated_at },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not save the evaluation');
  }
}
