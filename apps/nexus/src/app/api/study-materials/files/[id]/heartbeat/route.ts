import { NextRequest, NextResponse } from 'next/server';
import { markFileHeartbeat } from '@neram/database';
import { getRequestUser, isStaff } from '@/lib/study-materials';

/**
 * POST /api/study-materials/files/[id]/heartbeat
 *
 * Silently records idle-aware reading time for the current student while a study file is open.
 * Called every ~60s (fetch + Authorization header) and once more on page-hide/unload via
 * navigator.sendBeacon (which cannot set headers, so it passes ?token=&seconds=).
 *
 * Body: { activeSeconds } for the periodic fetch; OR query ?seconds= for the beacon flush.
 * Staff previews are not tracked. Non-fatal by design (never 500s the viewer).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const tokenString = authHeader || (queryToken ? `Bearer ${queryToken}` : null);
    const user = await getRequestUser(tokenString);

    // Only students accrue study time; a teacher previewing must not pollute progress.
    if (isStaff(user)) return NextResponse.json({ ok: true });

    let seconds = 0;
    const qs = request.nextUrl.searchParams.get('seconds');
    if (qs != null) {
      seconds = parseInt(qs, 10) || 0;
    } else {
      const body = await request.json().catch(() => null);
      seconds = Number(body?.activeSeconds) || 0;
    }

    await markFileHeartbeat(user.id, params.id, seconds);
    return NextResponse.json({ ok: true });
  } catch {
    // Heartbeats must never break the viewer.
    return NextResponse.json({ ok: false });
  }
}
