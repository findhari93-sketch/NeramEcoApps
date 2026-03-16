import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules
 * List all modules with item counts.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: modules, error } = await supabase
      .from('nexus_modules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get item counts per module
    const moduleIds = (modules || []).map((m: any) => m.id);
    const { data: items } = await supabase
      .from('nexus_module_items')
      .select('module_id')
      .in('module_id', moduleIds);

    const itemCounts: Record<string, number> = {};
    for (const item of items || []) {
      itemCounts[item.module_id] = (itemCounts[item.module_id] || 0) + 1;
    }

    const result = (modules || []).map((m: any) => ({
      ...m,
      itemCount: itemCounts[m.id] || 0,
    }));

    return NextResponse.json({ modules: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load modules';
    console.error('Modules GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/modules
 * Create a new module.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, icon, color } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data: module, error } = await supabase
      .from('nexus_modules')
      .insert({
        title,
        description: description || null,
        icon: icon || null,
        color: color || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ module }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create module';
    console.error('Modules POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
