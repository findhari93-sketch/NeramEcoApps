export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getProfileHistoryWithDetails } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const history = await getProfileHistoryWithDetails(params.id, {
      limit,
      offset,
    });

    return NextResponse.json({ history });
  } catch (error: any) {
    console.error('CRM history fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}