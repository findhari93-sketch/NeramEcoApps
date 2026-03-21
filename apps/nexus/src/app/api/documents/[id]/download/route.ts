import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointDownloadUrl } from '@/lib/sharepoint';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/documents/[id]/download
 * Returns a fresh pre-authenticated SharePoint download URL
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    // Use 'any' cast for columns not in generated types
    const db = supabase as any;

    const { data: doc } = await db
      .from('nexus_student_documents')
      .select('file_url, sharepoint_item_id')
      .eq('id', id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.sharepoint_item_id) {
      const url = await getSharePointDownloadUrl(doc.sharepoint_item_id);
      return NextResponse.json({ url });
    }

    // Fallback to stored file_url for legacy documents
    return NextResponse.json({ url: doc.file_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get download URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
