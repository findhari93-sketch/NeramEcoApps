/**
 * Publish every ready paper at once.
 *
 * The per paper switch lives in each paper's Student access tab. This exists
 * because the first run means visiting every paper before a student sees a
 * single one, which is how a bank of two dozen parsed papers ends up invisible.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBStaff } from '@/lib/qb-auth';
import { publishReadyPapers } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const result = await publishReadyPapers();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[QB Papers Bulk Publish] POST:', messageOf(err), err);
    return errorResponse(err, 'Something went wrong.');
  }
}
