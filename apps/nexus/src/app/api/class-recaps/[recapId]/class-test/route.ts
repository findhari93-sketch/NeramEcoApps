import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { buildClassTestFromRecap, getClassTestForClass, getRecapById } from '@neram/database';

/**
 * The class test a catch-up student must pass at 85% to clear this class.
 *
 * Assembled from the checkpoint questions this recap already owns, so building
 * one costs no AI calls and every question has already been through the
 * teacher's review in the recap editor.
 */

/** GET: does a class test exist for this recap's class, and how big is it? */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;

    const recap = await getRecapById(recapId);
    if (!recap) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
    if (!recap.scheduled_class_id) {
      // An ad-hoc recap has no class, so it can never be a catch-up backlog item.
      return NextResponse.json({ test: null, buildable: false, reason: 'no_class' });
    }

    const test = await getClassTestForClass(recap.scheduled_class_id);
    return NextResponse.json({ test, buildable: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the class test';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 401 });
  }
}

/** POST: build or rebuild it. Rebuilding retires the old one and keeps past attempts. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    const staff = await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;

    const result = await buildClassTestFromRecap(recapId, { createdBy: staff.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the class test';
    if (message === 'Not authorized') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === 'RECAP_NOT_FOUND') {
      return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
    }
    if (message === 'RECAP_HAS_NO_CLASS') {
      return NextResponse.json(
        {
          error:
            'This recap is not linked to a scheduled class, so it cannot have a class test.',
        },
        { status: 400 },
      );
    }
    if (message === 'NO_CHECKPOINT_QUESTIONS') {
      return NextResponse.json(
        {
          error:
            'Add checkpoints with questions to this recap first. The class test is built from them.',
        },
        { status: 400 },
      );
    }
    console.error('Class test build error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
