export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { signedProofUrl } from '@neram/database/payment-proof';
import { actingAdminId } from '@/lib/fee-request';

/**
 * GET /api/payment-proof?src=<stored url or object path>
 *
 * Payment screenshots live in the private 'payment-proofs' bucket. Whatever a
 * row stores (an old public URL, a signed URL, a bare path) is turned into a
 * fresh 10-minute signed link for the signed-in staff member who clicked.
 */
export async function GET(request: NextRequest) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const src = request.nextUrl.searchParams.get('src');
  if (!src) return NextResponse.json({ error: 'Nothing to open.' }, { status: 400 });

  const url = await signedProofUrl(getSupabaseAdminClient(), src, 600);
  if (!url) return NextResponse.json({ error: 'This screenshot is not in the payment proofs store.' }, { status: 404 });
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
}
