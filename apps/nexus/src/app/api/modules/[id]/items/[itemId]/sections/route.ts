import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
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

/**
 * GET /api/modules/[id]/items/[itemId]/sections
 * List sections for a module item with question counts (Admin).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { itemId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data: sections, error } = await supabase
      .from('nexus_module_item_sections')
      .select('*, quiz_questions:nexus_module_item_quiz_questions(count)')
      .eq('module_item_id', itemId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ sections: sections || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sections';
    console.error('Module sections GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/modules/[id]/items/[itemId]/sections
 * Create a section (Admin).
 * Body: { title, description?, start_timestamp_seconds, end_timestamp_seconds, sort_order?, min_questions_to_pass? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { itemId } = await params;
    const supabase = getSupabaseAdminClient() as any;
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

    const { data: section, error } = await supabase
      .from('nexus_module_item_sections')
      .insert({
        module_item_id: itemId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        start_timestamp_seconds: body.start_timestamp_seconds,
        end_timestamp_seconds: body.end_timestamp_seconds,
        sort_order: body.sort_order ?? 0,
        min_questions_to_pass: body.min_questions_to_pass ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ section }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create section';
    console.error('Module sections POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
