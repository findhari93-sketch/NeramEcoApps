import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  updateFoundationChapter,
  deleteFoundationChapter,
  getChapterSectionsAdmin,
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
    const supabase = getSupabaseAdminClient();

    const { data: chapter, error } = await supabase
      .from('nexus_foundation_chapters')
      .select('*')
      .eq('id', params.id)
      .single();
    if (error) throw error;

    const sections = await getChapterSectionsAdmin(params.id);

    return NextResponse.json({ chapter, sections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load chapter';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const body = await request.json();

    const chapter = await updateFoundationChapter(params.id, body);
    return NextResponse.json({ chapter });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update chapter';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    await deleteFoundationChapter(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete chapter';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
