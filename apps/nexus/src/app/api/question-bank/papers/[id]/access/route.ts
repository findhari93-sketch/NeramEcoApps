/**
 * The "Student access" panel behind one original paper.
 *
 * GET returns everything the panel draws in a single call: the paper, how many
 * active questions it carries, the linked PDF, the placed mock, and why it
 * cannot be published yet. Four reads server-side rather than four requests, so
 * opening the tab costs one function invocation.
 *
 * PATCH does the two things the panel writes: point the paper at its PDF, and
 * publish it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getPaperStaffView, setPaperStudentVisibility, setPaperStudyFile } from '@neram/database';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(_request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const view = await getPaperStaffView(params.id);
    if (!view) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    return NextResponse.json({ data: view });
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Paper Access] GET:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const body = (await request.json()) as {
      study_file_id?: string | null;
      is_student_visible?: boolean;
    };

    // Order matters: linking a PDF is what makes a question-less paper
    // publishable, so a panel that links and publishes in one press has to link
    // first or the publish is refused for a reason that is no longer true.
    if ('study_file_id' in body) {
      await setPaperStudyFile(params.id, body.study_file_id ?? null);
    }
    if (typeof body.is_student_visible === 'boolean') {
      await setPaperStudentVisibility(params.id, body.is_student_visible);
    }

    const view = await getPaperStaffView(params.id);
    if (!view) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    return NextResponse.json({ data: view });
  } catch (err) {
    const detail = messageOf(err);
    // paperPublishBlocker throws its own sentence, written for the teacher
    // reading it. Passing it through as a 400 keeps that wording instead of
    // replacing it with a generic refusal.
    if (detail.includes('before publishing') || detail === 'FILE_NOT_FOUND') {
      return NextResponse.json(
        { error: detail === 'FILE_NOT_FOUND' ? 'That file no longer exists.' : detail },
        { status: 400 },
      );
    }
    console.error('[QB Paper Access] PATCH:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}
