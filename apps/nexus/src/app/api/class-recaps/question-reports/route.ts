import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { httpStatusForError, messageOf, throwIfReadFailed } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  listOpenRecapQuestionReports,
  resolveRecapQuestionReport,
} from '@neram/database';

/**
 * GET  /api/class-recaps/question-reports    open reports across the classrooms
 * PATCH /api/class-recaps/question-reports   { id, status, note? }
 *
 * The one thing on the Classes and recaps tab that a person genuinely has to
 * do. Everything else there publishes itself; a student saying "this question
 * is wrong" is the exception the automation cannot settle, because only a
 * teacher knows what was actually taught.
 *
 * The student is already unblocked by the time this list is read: reporting
 * drops the question from their paper. So this is not an emergency queue, it is
 * a correctness queue, and it stays short by construction.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: rooms, error: roomsError } = await supabase.from('nexus_classrooms').select('id');
    // Without this a failed read became zero classrooms and an inbox that said
    // nobody had reported anything.
    throwIfReadFailed(roomsError, 'the classrooms');
    const classroomIds = ((rooms as Array<{ id: string }>) || []).map((r) => r.id);

    const items = await listOpenRecapQuestionReports(classroomIds, supabase);
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    return NextResponse.json({ error: messageOf(err, 'Failed to load reported questions') }, { status: httpStatusForError(err) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const teacher = await verifyTeacher(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));

    const id = typeof body.id === 'string' ? body.id : null;
    const status = body.status === 'resolved' || body.status === 'dismissed' ? body.status : null;
    if (!id || !status) {
      return NextResponse.json({ error: 'Need a report and what happened to it' }, { status: 400 });
    }

    await resolveRecapQuestionReport({
      reportId: id,
      status,
      // Who closed it, which the recap tables record nowhere else. The manual
      // "Publish anyway" path discards the identity it verifies, so five recaps
      // went live on 2026-09-18 with no record of who released them.
      resolvedBy: teacher.id,
      note: typeof body.note === 'string' ? body.note : null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: messageOf(err, 'Failed to update the report') }, { status: httpStatusForError(err) });
  }
}
