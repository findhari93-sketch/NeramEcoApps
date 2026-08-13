import { NextRequest, NextResponse } from 'next/server';
import { updateAnnotation, softDeleteAnnotation } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';

const MAX_NOTE_LENGTH = 2000;

/**
 * PATCH /api/study-materials/annotations/[id] — edit color and/or the attached note.
 * DELETE /api/study-materials/annotations/[id] — soft-delete (eraser tool).
 *
 * Both are student-only and ownership is enforced inside the query itself (student_id
 * is part of the WHERE clause), so a request against someone else's annotation simply
 * matches no row and comes back as a 404, with no separate authorization branch needed.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const raw = await request.json();

    const patch: { color?: string; note_text?: string | null } = {};
    if (typeof raw?.color === 'string' && raw.color) patch.color = raw.color;
    if (raw?.note_text !== undefined) {
      patch.note_text = typeof raw.note_text === 'string' ? raw.note_text.trim().slice(0, MAX_NOTE_LENGTH) || null : null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const annotation = await updateAnnotation(params.id, user.id, patch);
    if (!annotation) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
    return NextResponse.json({ annotation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update annotation';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const deleted = await softDeleteAnnotation(params.id, user.id);
    if (!deleted) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete annotation';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
