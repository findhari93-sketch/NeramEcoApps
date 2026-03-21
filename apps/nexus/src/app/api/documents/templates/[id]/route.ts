import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/documents/templates/[id]
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    // nexus_document_templates not in generated types
    const db = getSupabaseAdminClient() as any;

    const { data, error } = await db
      .from('nexus_document_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load template';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PATCH /api/documents/templates/[id]
 * Update a template (teacher only)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Only teachers can update templates' }, { status: 403 });
    }

    const body = await request.json();
    const { data, error } = await db
      .from('nexus_document_templates')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ template: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/templates/[id]
 * Deactivate (soft-delete) a template
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { error } = await db
      .from('nexus_document_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
