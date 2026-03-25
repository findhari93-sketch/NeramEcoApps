import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getCampaignStudents,
  addStudentsToCampaign,
} from '@neram/database';

/**
 * GET /api/review-campaigns/[id]/students?platform=&status=&search=&limit=&offset=
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const platform = request.nextUrl.searchParams.get('platform') as any;
    const status = request.nextUrl.searchParams.get('status') as any;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    const result = await getCampaignStudents({
      campaignId: params.id,
      platform: platform || undefined,
      status: status || undefined,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/review-campaigns/[id]/students
 * Body: { student_ids: string[], platforms: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { student_ids, platforms } = body;

    if (!student_ids?.length || !platforms?.length) {
      return NextResponse.json({ error: 'student_ids and platforms required' }, { status: 400 });
    }

    const result = await addStudentsToCampaign(params.id, student_ids, platforms);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add students';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
