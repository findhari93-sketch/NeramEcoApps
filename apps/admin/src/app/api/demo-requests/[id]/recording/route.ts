export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { demoRecordingPlayUrl } from '@/lib/demo/teams-artifacts';

/**
 * GET /api/demo-requests/[id]/recording: a short-lived playable URL for the
 * picked recording, streamed with the app's own Graph access so any staff
 * member signed in to Admin can review it (middleware checks the caller).
 * Not cached: the URL expires within the hour.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase
    .from('demo_class_registrations')
    .select('recording_drive_id, recording_item_id, recording_name, recording_web_url')
    .eq('id', params.id)
    .maybeSingle();
  if (!data?.recording_item_id || !data.recording_drive_id) {
    return NextResponse.json({ error: 'No recording picked for this demo yet.' }, { status: 404 });
  }
  try {
    const url = await demoRecordingPlayUrl(data.recording_drive_id, data.recording_item_id);
    if (!url) {
      return NextResponse.json(
        { error: 'Microsoft did not return the video. It may have been moved or deleted. Open it in OneDrive instead.', webUrl: data.recording_web_url },
        { status: 502 },
      );
    }
    return NextResponse.json({ url, name: data.recording_name, webUrl: data.recording_web_url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('demo recording url failed:', err);
    return NextResponse.json({ error: 'Could not reach Microsoft. Try again.', webUrl: data.recording_web_url }, { status: 502 });
  }
}
