import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getChapterSectionsAdmin,
  createFoundationSection,
} from '@neram/database/queries/nexus';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const sections = await getChapterSectionsAdmin(params.id);
    return NextResponse.json({ sections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const body = await request.json();

    if (!body.title?.trim() || body.start_timestamp_seconds == null || body.end_timestamp_seconds == null) {
      return NextResponse.json(
        { error: 'title, start_timestamp_seconds, and end_timestamp_seconds are required' },
        { status: 400 }
      );
    }

    if (body.end_timestamp_seconds <= body.start_timestamp_seconds) {
      return NextResponse.json(
        { error: 'end_timestamp must be greater than start_timestamp' },
        { status: 400 }
      );
    }

    const section = await createFoundationSection({
      chapter_id: params.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      start_timestamp_seconds: body.start_timestamp_seconds,
      end_timestamp_seconds: body.end_timestamp_seconds,
      sort_order: body.sort_order ?? 0,
    });

    return NextResponse.json({ section }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create section';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
