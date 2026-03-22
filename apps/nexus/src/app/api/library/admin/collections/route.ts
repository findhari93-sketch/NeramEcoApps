import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createCollection } from '@neram/database/queries/nexus';

/**
 * GET /api/library/admin/collections
 *
 * List all collections (including unpublished) for teacher/admin.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('library_collections')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load collections';
    console.error('Admin collections GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/library/admin/collections
 *
 * Create a collection.
 * Body: { title, description?, exam?, classroom_id?, is_published? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, exam, classroom_id, is_published } = body;

    if (!title) {
      return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
    }

    const collection = await createCollection({
      title,
      description,
      exam,
      classroom_id,
      is_published: is_published ?? false,
      created_by: user.id,
    });

    return NextResponse.json({ data: collection }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create collection';
    console.error('Admin collections POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
