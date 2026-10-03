import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { addSketchForStudent } from '@/lib/sketchbook-add';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/sketchbook/entries   (student)
 * body { original_image_url, thumbnail_url?, caption?, inspiration_item_id?, image_quality? }
 *
 * The image is already in the drawing-uploads bucket (POST /api/drawing/upload).
 * The rules live in lib/sketchbook-add.ts, shared with the Neram Assistant.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const result = await addSketchForStudent(caller, body);
    return NextResponse.json(result, { status: 201, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not add the sketch');
  }
}
