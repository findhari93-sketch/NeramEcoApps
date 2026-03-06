// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getHomepageSocialProofs, getSocialProofsByType } from '@neram/database';
import type { SocialProofType } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const homepage = searchParams.get('homepage') === 'true';
    const type = searchParams.get('type') as SocialProofType | null;
    const client = getSupabaseAdminClient();

    if (homepage) {
      const data = await getHomepageSocialProofs(client);
      return NextResponse.json({ success: true, data });
    }

    if (type) {
      const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;
      const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;
      const result = await getSocialProofsByType(type, { limit, offset }, client);
      return NextResponse.json({ success: true, ...result });
    }

    // Default: return homepage proofs
    const data = await getHomepageSocialProofs(client);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching social proofs:', error);
    return NextResponse.json({ error: 'Failed to fetch social proofs' }, { status: 500 });
  }
}
