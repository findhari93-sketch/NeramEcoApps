import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { uploadToSharePoint } from '@/lib/sharepoint';
import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * GET /api/documents?classroom={id}&template_id=&status=
 * Returns student's own documents (current, non-deleted)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use 'any' cast because nexus_student_documents has columns not in generated types
    let query = (supabase as any)
      .from('nexus_student_documents')
      .select('*, template:template_id(id, name, category, is_required)')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_current', true)
      .eq('is_deleted', false);

    const templateId = request.nextUrl.searchParams.get('template_id');
    if (templateId) query = query.eq('template_id', templateId);

    const status = request.nextUrl.searchParams.get('status');
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('uploaded_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ documents: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load documents';
    console.error('Documents GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents
 * Upload a document to SharePoint and create record.
 * Body: FormData with file, template_id, classroom_id, title, category
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const classroomId = formData.get('classroom_id') as string;
    const templateId = formData.get('template_id') as string | null;
    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const examAttemptId = formData.get('exam_attempt_id') as string | null;

    if (!file || !classroomId || !title || !category) {
      return NextResponse.json({ error: 'Missing required fields: file, classroom_id, title, category' }, { status: 400 });
    }

    // Validate file size against template if provided
    if (templateId) {
      const { data: template } = await (supabase as any)
        .from('nexus_document_templates')
        .select('max_file_size_mb, allowed_file_types')
        .eq('id', templateId)
        .single();

      if (template) {
        const maxBytes = (template.max_file_size_mb || 10) * 1024 * 1024;
        if (file.size > maxBytes) {
          return NextResponse.json(
            { error: `File too large. Maximum ${template.max_file_size_mb} MB allowed.` },
            { status: 400 }
          );
        }
        const allowedTypes = template.allowed_file_types as string[] | null;
        if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
          return NextResponse.json(
            { error: `File type ${file.type} not allowed. Allowed: ${allowedTypes.join(', ')}` },
            { status: 400 }
          );
        }
      }
    }

    // Upload to SharePoint
    const buffer = new Uint8Array(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const spPath = `nexus/documents/${classroomId}/${user.id}/${templateId || 'general'}/${timestamp}.${ext}`;
    const token = await getAppOnlyToken();
    const spResult = await uploadToSharePoint(token, spPath, buffer, file.type);

    // Handle versioning: mark previous document as not current
    // Use 'any' cast for columns not in generated types
    const db = supabase as any;
    let previousVersionId: string | null = null;
    let version = 1;
    if (templateId) {
      const { data: existing } = await db
        .from('nexus_student_documents')
        .select('id, version')
        .eq('student_id', user.id)
        .eq('classroom_id', classroomId)
        .eq('template_id', templateId)
        .eq('is_current', true)
        .eq('is_deleted', false)
        .single();

      if (existing) {
        previousVersionId = existing.id;
        version = (existing.version || 1) + 1;
        await db
          .from('nexus_student_documents')
          .update({ is_current: false })
          .eq('id', existing.id);
      }
    }

    // Create document record
    const { data: doc, error } = await db
      .from('nexus_student_documents')
      .insert({
        student_id: user.id,
        classroom_id: classroomId,
        template_id: templateId || null,
        category,
        title,
        file_url: spResult.sharingUrl,
        file_type: file.type || null,
        sharepoint_item_id: spResult.itemId,
        sharepoint_web_url: spResult.webUrl,
        file_size_bytes: file.size,
        version,
        is_current: true,
        previous_version_id: previousVersionId,
        uploaded_by: user.id,
        exam_attempt_id: examAttemptId || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await db.from('nexus_document_audit_log').insert({
      document_id: doc.id,
      student_id: user.id,
      classroom_id: classroomId,
      action: previousVersionId ? 're_uploaded' : 'uploaded',
      performed_by: user.id,
      metadata: {
        title,
        category,
        template_id: templateId,
        file_type: file.type,
        file_size: file.size,
        version,
        exam_attempt_id: examAttemptId,
      },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload document';
    console.error('Documents POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
