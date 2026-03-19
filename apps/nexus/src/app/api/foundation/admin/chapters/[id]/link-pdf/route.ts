import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';

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

/**
 * Encode a sharing URL for the Graph API /shares endpoint.
 * Format: "u!" + base64url(sharingUrl)
 */
function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64url}`;
}

/**
 * POST /api/foundation/admin/chapters/[id]/link-pdf
 * Resolves a SharePoint URL to a drive item and stores the reference.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const supabase = getSupabaseAdminClient() as any;
    const chapterId = params.id;
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    // Use app-only token to resolve the sharing URL
    const token = await getAppOnlyToken();

    // Try to resolve via /shares endpoint (works for sharing links and direct URLs)
    const encoded = encodeSharingUrl(url);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,name,webUrl,file,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Could not resolve SharePoint URL: ${res.status} ${err}` },
        { status: 400 }
      );
    }

    const item = await res.json();

    // Verify it's a PDF
    if (!item.name?.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'The linked file is not a PDF' },
        { status: 400 }
      );
    }

    // Get a download URL for the item
    const dlRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let downloadUrl = url; // fallback to original URL
    if (dlRes.ok) {
      const dlData = await dlRes.json();
      if (dlData['@microsoft.graph.downloadUrl']) {
        downloadUrl = dlData['@microsoft.graph.downloadUrl'];
      }
    }

    // Update chapter with link info
    const { error: updateError } = await supabase
      .from('nexus_foundation_chapters')
      .update({
        pdf_url: downloadUrl,
        pdf_storage_path: null,
        pdf_page_count: null,
        pdf_onedrive_item_id: item.id,
        pdf_source: 'link',
      })
      .eq('id', chapterId);

    if (updateError) throw updateError;

    return NextResponse.json({
      pdf_url: downloadUrl,
      pdf_onedrive_item_id: item.id,
      pdf_source: 'link',
      file_name: item.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Link failed';
    console.error('PDF link error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/foundation/admin/chapters/[id]/link-pdf
 * Clears PDF fields (does NOT delete the file from SharePoint since we didn't upload it).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const supabase = getSupabaseAdminClient() as any;

    const { error } = await supabase
      .from('nexus_foundation_chapters')
      .update({
        pdf_url: null,
        pdf_storage_path: null,
        pdf_page_count: null,
        pdf_onedrive_item_id: null,
        pdf_source: null,
      })
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unlink failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
