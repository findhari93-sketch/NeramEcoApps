/**
 * Store a photo measurement for a drawing.
 *
 * The browser measures (lib/image-quality.ts), because the pixels are already
 * there and a function would have to download a multi-megabyte photo to do the
 * same arithmetic. This validates the numbers and stores them. A teacher's
 * browser calls it for sheets uploaded before measurement existed; new sheets
 * arrive already measured from the student's phone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { parseQuality } from '@/lib/image-quality';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { quality?: unknown };
    const quality = parseQuality(body.quality);
    if (!quality) return NextResponse.json({ error: 'That is not a photo measurement' }, { status: 400 });

    const { data, error } = await auth.supabase
      .from('drawing_submissions')
      .update({ image_quality: quality })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    return NextResponse.json({ ok: true, quality });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not store the measurement';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Photo quality is not migrated here', detail: message }, { status: 503 });
    }
    return errorResponse(err, 'Could not store the measurement');
  }
}
