import { NextResponse } from 'next/server';
import { publicDemoSettings } from '@neram/database';
import { loadDemoSettings } from '@/lib/demo-request';

export const dynamic = 'force-dynamic';

/**
 * GET /api/demo-class/settings: what the booking card needs (time windows,
 * days offered, drawing WhatsApp number, sample video). Never the hosts'
 * mailboxes. Cached at the edge for 5 minutes; settings change rarely.
 */
export async function GET() {
  try {
    const settings = publicDemoSettings(await loadDemoSettings());
    return NextResponse.json(
      { settings: { ...settings, youtube_video_url: settings.youtubeUrl } },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch {
    return NextResponse.json({ settings: {} });
  }
}
