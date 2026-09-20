import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingSubmissionComments, addDrawingSubmissionComment } from '@neram/database/queries/nexus';
import { errorResponse } from '@/lib/api-errors';

/**
 * The comment thread on one drawing: the student reads it on their sketch page,
 * the teacher writes in it from the review screen.
 *
 * Both handlers used to check only that SOMEBODY was signed in. The submission
 * id came straight from the URL and was never matched against the caller, so any
 * student could read, and add to, another student's thread by putting a
 * different id in the address bar. Teenagers' feedback is exactly the thing that
 * must not be browsable.
 *
 * The rule is the one the sibling route (../route.ts) already settled on: staff,
 * or the student whose drawing this is. A stranger is told 404 rather than 403,
 * so a guessed id cannot confirm that another student's work exists.
 */

const STAFF_TYPES = ['teacher', 'admin'];

type Ctx = { params: Promise<{ id: string }> };

/** Nobody outside the conversation learns whether the drawing is real. */
const notFound = () => NextResponse.json({ error: 'Submission not found' }, { status: 404 });

interface Viewer {
  id: string;
  role: 'student' | 'teacher';
}

/** The caller and how they sign the comment, or null when this thread is not theirs. */
async function viewerFor(request: NextRequest, submissionId: string): Promise<Viewer | null> {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;

  // student_id only. The row is read for an access decision, not for display,
  // and naming a column that one environment lacks is how PostgREST returns an
  // error and zero rows (staging has no exam_attempt_id, production does).
  const [{ data: user }, { data: submission }] = await Promise.all([
    supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).maybeSingle(),
    supabase.from('drawing_submissions').select('student_id').eq('id', submissionId).maybeSingle(),
  ]);

  if (!user || !submission) return null;
  const isStaff = STAFF_TYPES.includes(user.user_type ?? '');
  if (!isStaff && user.id !== submission.student_id) return null;
  return { id: user.id, role: isStaff ? 'teacher' : 'student' };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const viewer = await viewerFor(request, id);
    if (!viewer) return notFound();

    const comments = await getDrawingSubmissionComments(id);
    return NextResponse.json({ comments }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Failed to load comments');
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    // Access first, then the body. Validating first would answer a stranger 400
    // for an empty comment and 404 otherwise, which tells them the id was real.
    const viewer = await viewerFor(request, id);
    if (!viewer) return notFound();

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const text = typeof body?.comment_text === 'string' ? body.comment_text.trim() : '';
    if (!text) {
      return NextResponse.json({ error: 'Comment text required' }, { status: 400 });
    }

    const comment = await addDrawingSubmissionComment({
      submission_id: id,
      author_id: viewer.id,
      author_role: viewer.role,
      comment_text: text,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'Failed to add comment');
  }
}
