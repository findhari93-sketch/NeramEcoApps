export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { resolveCreditErrors, staffName } from '@/lib/aintra-inbox/server';

const NO_STORE = { 'Cache-Control': 'no-store' };

// POST /api/aintra-inbox/resolve { kind: 'credits' }
// Marks every question that got no answer because AI credits ran out, and has
// no saved answer yet, as resolved. They leave the Review queue and the badge.
export async function POST(request: NextRequest) {
  let kind: unknown;
  try {
    kind = (await request.json())?.kind;
  } catch {
    kind = null;
  }
  if (kind !== 'credits') return NextResponse.json({ error: 'Unknown kind' }, { status: 400, headers: NO_STORE });
  try {
    const db = createAdminClient() as any;
    const adminId = getRequestAdminId(request);
    const resolved = await resolveCreditErrors(db, { id: adminId, name: await staffName(db, adminId) });
    return NextResponse.json({ resolved }, { headers: NO_STORE });
  } catch (err) {
    console.error('[aintra-inbox/resolve] failed:', err);
    return NextResponse.json({ error: 'Could not resolve these questions' }, { status: 500, headers: NO_STORE });
  }
}
