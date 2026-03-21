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

    const { data: doc } = await supabase
      .from('nexus_student_documents')
      .select('file_url')
      .eq('id', id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check for sharepoint_item_id (may exist at DB level but not in generated types)
    const { data: rawDoc } = await supabase
      .from('nexus_student_documents')
      .select('*')
      .eq('id', id)
      .single();

    const spItemId = (rawDoc as Record<string, unknown>)?.sharepoint_item_id as string | undefined;
    if (spItemId) {
      const url = await getSharePointDownloadUrl(spItemId);
      return NextResponse.json({ url });
    }

    // Fallback to stored file_url for legacy documents
    return NextResponse.json({ url: doc.file_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get download URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
