import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { deleteFromSharePoint } from '@/lib/sharepoint';
import { getAppOnlyToken } from '@/lib/graph-app-token';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/documents/[id]
 * Get document detail with version history
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();

    const { data: doc, error } = await supabase
      .from('nexus_student_documents')
      .select('*, template:template_id(id, name, category, is_required)')
      .eq('id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get version history (previous_version_id may exist at DB level but not in generated types)
    const rawDoc = doc as Record<string, unknown>;
    const versions: Record<string, unknown>[] = [];
    let prevId = rawDoc.previous_version_id as string | undefined;
    while (prevId) {
      const { data: prev } = await supabase
        .from('nexus_student_documents')
        .select('*')
        .eq('id', prevId)
        .single();
      if (!prev) break;
      versions.push(prev);
      prevId = (prev as Record<string, unknown>).previous_version_id as string | undefined;
    }

    return NextResponse.json({ document: doc, versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load document';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PATCH /api/documents/[id]
 * Verify or reject a document (teacher only)
 * Body: { action: 'verify' | 'reject', rejection_reason?: string }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify the document exists
    const { data: doc } = await supabase
      .from('nexus_student_documents')
      .select('id, student_id, classroom_id, status')
      .eq('id', id)
      .single();

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Verify teacher role in this classroom
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', doc.classroom_id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not authorized for this classroom' }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action as 'verify' | 'reject';

    if (!['verify', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be verify or reject.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (action === 'verify') {
      updates.status = 'verified';
      updates.verified_by = user.id;
      updates.verified_at = new Date().toISOString();
      updates.rejection_reason = null;
    } else {
      updates.status = 'rejected';
      updates.rejection_reason = body.rejection_reason || null;
      updates.verified_by = null;
      updates.verified_at = null;
    }

    const { data: updated, error } = await supabase
      .from('nexus_student_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await supabase.from('nexus_document_audit_log').insert({
      document_id: id,
      student_id: doc.student_id,
      classroom_id: doc.classroom_id,
      action: action === 'verify' ? 'verified' : 'rejected',
      performed_by: user.id,
      metadata: {
        previous_status: doc.status,
        rejection_reason: body.rejection_reason || null,
      },
    });

    return NextResponse.json({ document: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[id]?hard=true
 * Soft delete by default, hard delete if ?hard=true
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    const hard = request.nextUrl.searchParams.get('hard') === 'true';
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: doc } = await supabase
      .from('nexus_student_documents')
      .select('id, student_id, classroom_id')
      .eq('id', id)
      .single();

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Get sharepoint_item_id via wildcard (may exist at DB level but not in generated types)
    const { data: rawDoc } = await supabase
      .from('nexus_student_documents')
      .select('*')
      .eq('id', id)
      .single();
    const spItemId = (rawDoc as Record<string, unknown>)?.sharepoint_item_id as string | undefined;

    if (hard) {
      // Delete from SharePoint if item ID exists
      if (spItemId) {
        try {
          const token = await getAppOnlyToken();
          await deleteFromSharePoint(token, spItemId);
        } catch (spErr) {
          console.error('SharePoint delete error:', spErr);
        }
      }

      await supabase.from('nexus_student_documents').delete().eq('id', id);

      await supabase.from('nexus_document_audit_log').insert({
        document_id: id,
        student_id: doc.student_id,
        classroom_id: doc.classroom_id,
        action: 'hard_deleted',
        performed_by: user.id,
        metadata: {},
      });
    } else {
      await supabase
        .from('nexus_student_documents')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
        })
        .eq('id', id);

      await supabase.from('nexus_document_audit_log').insert({
        document_id: id,
        student_id: doc.student_id,
        classroom_id: doc.classroom_id,
        action: 'soft_deleted',
        performed_by: user.id,
        metadata: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
