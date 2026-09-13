/**
 * Every drawing brief type, with how close each is to being switched on.
 *
 * Read by the assignment brief picker and the band wording screens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { loadBriefTypes } from '@/lib/drawing-brief-server';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ brief_types: await loadBriefTypes(auth.supabase) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load brief types';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Drawing evaluation is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
