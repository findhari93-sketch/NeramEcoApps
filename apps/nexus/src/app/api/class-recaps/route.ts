import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import {
  createRecapForClass,
  createManualRecap,
  getRecapByClass,
  listRecapsForClassroom,
} from '@neram/database';
import { normalizeRecordingUrl } from '@/lib/sharepoint-transcript';

/**
 * GET /api/class-recaps?classroomId=... | ?scheduledClassId=...
 * Teacher/management: list recaps for a classroom (with completion counts),
 * or fetch the single recap tied to a scheduled class.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get('classroomId');
    const scheduledClassId = searchParams.get('scheduledClassId');

    if (scheduledClassId) {
      const recap = await getRecapByClass(scheduledClassId);
      return NextResponse.json({ recap });
    }
    if (classroomId) {
      const recaps = await listRecapsForClassroom(classroomId);
      return NextResponse.json({ recaps });
    }
    return NextResponse.json({ error: 'Missing classroomId or scheduledClassId' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recaps';
    const status = message === 'Not authorized' ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/class-recaps
 * Two ways to create a draft recap:
 *   1. From a Nexus scheduled class:  { scheduled_class_id }
 *   2. Ad-hoc from a recording link:  { title, classroom_id, recording_url }
 *      (for a class scheduled directly in Teams, no scheduled_class row)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyTeacher(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));

    // Path 2: ad-hoc recap from a pasted recording link.
    if (body.recording_url || body.title || body.classroom_id) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const classroomId = body.classroom_id;
      const rawUrl = typeof body.recording_url === 'string' ? body.recording_url.trim() : '';
      if (!title || !classroomId || !rawUrl) {
        return NextResponse.json(
          { error: 'Missing title, classroom_id or recording_url' },
          { status: 400 },
        );
      }
      const recap = await createManualRecap(
        {
          title,
          classroomId,
          recordingUrl: normalizeRecordingUrl(rawUrl),
          createdBy: user.id,
        },
      );
      return NextResponse.json({ recap });
    }

    // Path 1: from a recorded Nexus scheduled class.
    const scheduledClassId = body.scheduled_class_id;
    if (!scheduledClassId) {
      return NextResponse.json({ error: 'Missing scheduled_class_id' }, { status: 400 });
    }
    const recap = await createRecapForClass(scheduledClassId, user.id);
    return NextResponse.json({ recap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create recap';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
