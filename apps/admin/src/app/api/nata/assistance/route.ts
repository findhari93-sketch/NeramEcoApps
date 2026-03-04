// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listNataAssistanceRequests } from '@neram/database';

// GET /api/nata/assistance - List all NATA assistance requests
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

    const result = await listNataAssistanceRequests({ status, limit, offset });
    return NextResponse.json({ data: result.data, count: result.count });
  } catch (error) {
    console.error('Error listing NATA assistance requests:', error);
    return NextResponse.json(
      { error: 'Failed to list NATA assistance requests' },
      { status: 500 }
    );
  }
}
