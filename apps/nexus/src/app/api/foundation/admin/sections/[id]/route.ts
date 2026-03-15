import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  updateFoundationSection,
  deleteFoundationSection,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const body = await request.json();

    if (body.end_timestamp_seconds != null && body.start_timestamp_seconds != null) {
      if (body.end_timestamp_seconds <= body.start_timestamp_seconds) {
        return NextResponse.json(
          { error: 'end_timestamp must be greater than start_timestamp' },
          { status: 400 }
        );
      }
    }

    const section = await updateFoundationSection(params.id, body);
    return NextResponse.json({ section });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update section';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    await deleteFoundationSection(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete section';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
