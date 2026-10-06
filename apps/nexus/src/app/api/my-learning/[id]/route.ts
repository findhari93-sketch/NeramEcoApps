import { NextRequest, NextResponse } from 'next/server';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';
import { isUuid } from '@/lib/assistant/ids';
import { assertTutorOn } from '@/lib/assistant/tutor/gate';
import { deleteLearningItem, updateLearningItem } from '@/lib/assistant/tutor/learning-items';

export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

/** PATCH /api/my-learning/[id]  body { note?, important? }   (student, own item; View as Student may read, not edit) */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
    await assertTutorOn(supabase, features);
    if (caller.impersonating) return NextResponse.json({ error: 'Viewing as a student, changes are not saved.' }, { status: 403, headers: NO_STORE });
    if (!isUuid(params.id)) return notFound();
    const body = await request.json().catch(() => ({}));
    const patch: { note?: string | null; important?: boolean } = {};
    if ('note' in (body || {})) {
      if (body.note !== null && typeof body.note !== 'string') return NextResponse.json({ error: 'A note is text.' }, { status: 400, headers: NO_STORE });
      patch.note = body.note;
    }
    if (typeof body?.important === 'boolean') patch.important = body.important;
    if (!('note' in patch) && !('important' in patch)) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400, headers: NO_STORE });
    const item = await updateLearningItem(supabase, caller.id, params.id, patch);
    return item ? NextResponse.json({ item }, { headers: NO_STORE }) : notFound();
  } catch (err) {
    return assistantErrorResponse(err, 'my-learning PATCH');
  }
}

/** DELETE /api/my-learning/[id]   (student, own item) */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
    await assertTutorOn(supabase, features);
    if (caller.impersonating) return NextResponse.json({ error: 'Viewing as a student, changes are not saved.' }, { status: 403, headers: NO_STORE });
    if (!isUuid(params.id)) return notFound();
    return (await deleteLearningItem(supabase, caller.id, params.id)) ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : notFound();
  } catch (err) {
    return assistantErrorResponse(err, 'my-learning DELETE');
  }
}
