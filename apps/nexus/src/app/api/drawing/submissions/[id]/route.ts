import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingSubmissionById } from '@neram/database/queries/nexus';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const submission = await getDrawingSubmissionById(id);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load submission';
    console.error('Submission GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch image URLs before deleting
    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('original_image_url, reviewed_image_url, corrected_image_url')
      .eq('id', id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Delete the row (cascades to comments, notifications)
    const { error: deleteError } = await supabase
      .from('drawing_submissions')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Best-effort: delete associated storage files
    const urlsToDelete = [
      submission.original_image_url,
      submission.reviewed_image_url,
      submission.corrected_image_url,
    ].filter(Boolean) as string[];

    for (const url of urlsToDelete) {
      try {
        const bucket = url.includes('drawing-reviewed') ? 'drawing-reviewed' : 'drawing-submissions';
        const path = url.split(`/${bucket}/`)[1];
        if (path) await supabase.storage.from(bucket).remove([path]);
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    console.error('Submission DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
