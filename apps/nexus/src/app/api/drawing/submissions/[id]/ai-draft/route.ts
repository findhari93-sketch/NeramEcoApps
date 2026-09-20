/**
 * The AI draft for one drawing, if one exists. Reads only; never asks for one.
 * `{ draft: null }` is the normal answer while evaluation is switched off.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDrawingStaff } from '@/lib/drawing-staff-auth';
import { loadAiDraft } from '@/lib/drawing-ai-draft-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    return NextResponse.json({ draft: await loadAiDraft(auth.supabase, id) });
  } catch (err) {
    return errorResponse(err, 'Could not load the draft');
  }
}
