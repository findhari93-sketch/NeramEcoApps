// @ts-nocheck
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, addStudentDocument, listStudentDocuments } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'documents';

/** GET /api/crm/alumni/[id]/documents — admin-uploaded documents for a student. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }
    const documents = await listStudentDocuments(params.id);
    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error('CRM alumni documents list error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list documents' }, { status: 500 });
  }
}

/**
 * POST /api/crm/alumni/[id]/documents (multipart)
 * Upload a document under a student to the Supabase `documents` bucket and record it.
 * Fields: file (required), title?, category?, adminId?
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    const title = (form.get('title') as string) || (file as any).name || 'Document';
    const category = (form.get('category') as string) || null;
    const adminId = (form.get('adminId') as string) || null;

    const buffer = Buffer.from(await (file as any).arrayBuffer());
    const ext = (((file as any).name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const supabase = getSupabaseAdminClient();
    const path = `alumni/${params.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: (file as any).type || 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const document = await addStudentDocument(
      {
        user_id: params.id,
        title,
        category,
        file_url: urlData.publicUrl,
        file_path: path,
        file_type: (file as any).type || null,
        file_size_bytes: buffer.length,
        uploaded_by: adminId && UUID_REGEX.test(adminId) ? adminId : null,
      },
      supabase,
    );

    return NextResponse.json({ success: true, document });
  } catch (error: any) {
    console.error('CRM alumni documents upload error:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload document' }, { status: 500 });
  }
}
