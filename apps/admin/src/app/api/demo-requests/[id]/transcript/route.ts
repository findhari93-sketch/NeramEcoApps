export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { parseDemoVtt } from '@/lib/demo/demo-transcript';

/**
 * GET /api/demo-requests/[id]/transcript: the demo's Teams transcript as cues
 * for the player beside the recording. Read only when staff open it, so the
 * desk list never carries transcripts (middleware checks the caller).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase.from('demo_transcripts').select('vtt, stats, created_at').eq('registration_id', params.id).maybeSingle();
  if (error) {
    console.error('demo transcript read failed:', error.message);
    return NextResponse.json({ error: 'Could not load the transcript. Try again.' }, { status: 500 });
  }
  if (!data?.vtt) return NextResponse.json({ error: 'No transcript for this demo yet.' }, { status: 404 });
  return NextResponse.json({ cues: parseDemoVtt(data.vtt), stats: data.stats, savedAt: data.created_at }, { headers: { 'Cache-Control': 'no-store' } });
}
