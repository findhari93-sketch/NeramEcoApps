import { NextRequest, NextResponse } from 'next/server';
import { getScoreCalculationsForAdmin } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get('tool') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);

    const result = await getScoreCalculationsForAdmin(params.id, { toolName, limit });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('CRM score calculations fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch score calculations' },
      { status: 500 }
    );
  }
}
