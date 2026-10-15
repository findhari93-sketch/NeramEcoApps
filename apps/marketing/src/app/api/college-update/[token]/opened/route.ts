export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { loadLink } from '@/lib/college-update/link';

/**
 * POST /api/college-update/<token>/opened
 * Sent by the form page from the browser after it loads, so the "Opened"
 * status in Admin counts people, not WhatsApp's link-preview robot (which
 * fetches the page but runs no JavaScript).
 */
export async function POST(_request: NextRequest, { params }: { params: { token: string } }) {
  const db = createAdminClient() as any;
  const { link, problem } = await loadLink(db, params.token);
  if (!link || problem) return new NextResponse(null, { status: 204 });
  const now = new Date().toISOString();
  await db
    .from('college_update_links')
    .update({ first_opened_at: link.first_opened_at ?? now, last_opened_at: now, open_count: (link.open_count ?? 0) + 1 })
    .eq('id', link.id);
  return new NextResponse(null, { status: 204 });
}
