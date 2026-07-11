import { NextRequest, NextResponse } from 'next/server';
import { toggleFavorite } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';

/**
 * POST /api/study-materials/files/[id]/favorite
 * Toggles the star on a file for the current user. Returns the new state.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const favorite = await toggleFavorite(user.id, params.id);
    return NextResponse.json({ favorite });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update favorite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
