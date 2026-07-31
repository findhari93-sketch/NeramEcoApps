import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { saveRecapSections, getRecapById } from '@neram/database';
import type { GeneratedRecapSection } from '@neram/database';

/**
 * PUT /api/class-recaps/[recapId]/sections
 * Save all checkpoints + questions (from the reviewed AI preview or an edit).
 * Body: { sections: GeneratedRecapSection[] }
 *
 * saveRecapSections, not replaceRecapSections. Once a recap is published or any
 * student has attempted a checkpoint, a blanket replace would cascade their
 * passed attempts away and silently re-lock them. Send each existing checkpoint
 * back with its `id` so it is updated in place; anything without an id is
 * treated as new, and anything omitted is archived rather than deleted.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const body = await request.json().catch(() => ({}));
    const sections = body.sections as GeneratedRecapSection[] | undefined;

    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: 'Missing sections array' }, { status: 400 });
    }
    // Basic validation so we never persist a checkpoint with no way to pass.
    for (const s of sections) {
      if (
        !s.title ||
        s.start_timestamp_seconds == null ||
        s.end_timestamp_seconds == null ||
        s.end_timestamp_seconds <= s.start_timestamp_seconds
      ) {
        return NextResponse.json({ error: 'A checkpoint has invalid timestamps' }, { status: 400 });
      }
    }

    await saveRecapSections(recapId, sections);
    const recap = await getRecapById(recapId);
    return NextResponse.json({ recap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save checkpoints';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
