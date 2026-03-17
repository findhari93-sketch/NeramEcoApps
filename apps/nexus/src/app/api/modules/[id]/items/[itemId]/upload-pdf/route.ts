import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { uploadToSharePoint, deleteFromSharePoint } from '@/lib/sharepoint';

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    await verifyTeacher(request);
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const supabase = getSupabaseAdminClient() as any;
    const { itemId } = params;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const pageCount = formData.get('page_count');

    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files allowed' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 });

    // Delete old PDF from SharePoint if exists
    const { data: item } = await supabase
      .from('nexus_module_items')
      .select('pdf_onedrive_item_id')
      .eq('id', itemId)
      .single();

    if (item?.pdf_onedrive_item_id) {
      await deleteFromSharePoint(token, item.pdf_onedrive_item_id).catch(() => {});
    }

    const timestamp = Date.now();
    const filePath = `nexus/modules/${params.id}/items/${itemId}/pdf/${timestamp}.pdf`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const result = await uploadToSharePoint(token, filePath, buffer, 'application/pdf');

    const { error: updateError } = await supabase
      .from('nexus_module_items')
      .update({
        pdf_url: result.sharingUrl,
        pdf_storage_path: filePath,
        pdf_page_count: pageCount ? parseInt(String(pageCount), 10) : null,
        pdf_onedrive_item_id: result.itemId,
      })
      .eq('id', itemId);

    if (updateError) throw updateError;

    return NextResponse.json({
      pdf_url: result.sharingUrl,
      pdf_storage_path: filePath,
      pdf_page_count: pageCount ? parseInt(String(pageCount), 10) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    await verifyTeacher(request);
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const supabase = getSupabaseAdminClient() as any;

    const { data: item } = await supabase
      .from('nexus_module_items')
      .select('pdf_onedrive_item_id')
      .eq('id', params.itemId)
      .single();

    if (item?.pdf_onedrive_item_id) {
      await deleteFromSharePoint(token, item.pdf_onedrive_item_id).catch(() => {});
    }

    const { error } = await supabase
      .from('nexus_module_items')
      .update({ pdf_url: null, pdf_storage_path: null, pdf_page_count: null, pdf_onedrive_item_id: null })
      .eq('id', params.itemId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
