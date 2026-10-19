export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, findActiveLinkForStudent, listDirectEnrollmentLinkEvents } from '@neram/database';
import { UUID_REGEX } from '@/lib/fee-request';
import { toLinkView } from '@/lib/enrolment-link-server';

/**
 * GET /api/direct-enrollment/lookup?userId=&phone=
 * The student's active enrolment link, if any, so the drawer opens that link
 * instead of letting staff make a second one.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || null;
  const phone = request.nextUrl.searchParams.get('phone') || null;
  if (userId && !UUID_REGEX.test(userId)) return NextResponse.json({ error: 'Invalid person.' }, { status: 400 });
  if (!userId && !phone) return NextResponse.json({ data: null });

  try {
    const supabase: any = getSupabaseAdminClient();
    const link = await findActiveLinkForStudent({ userId, phone }, supabase);
    if (!link) return NextResponse.json({ data: null });
    const [view, events] = await Promise.all([
      toLinkView(link, request, supabase),
      listDirectEnrollmentLinkEvents(link.id, supabase).catch(() => []),
    ]);
    return NextResponse.json({ data: { ...view, events } });
  } catch (error: any) {
    console.error('Enrolment link lookup failed:', error);
    return NextResponse.json({ error: 'Could not check for an existing link.' }, { status: 500 });
  }
}
