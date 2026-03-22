/**
 * YouTube Video Library Sync Script
 *
 * Fetches all videos (including unlisted) from the Neram Classes YouTube channel
 * and inserts them into the library_videos table in Supabase.
 *
 * Usage:
 *   cd scripts && npx tsx library-sync.ts
 *
 * First run will open a browser for Google OAuth consent.
 * Token is cached in scripts/.google-token.json for subsequent runs.
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';
import * as path from 'path';

// ── Config ──────────────────────────────────────────────────────────────────
const CHANNEL_ID = 'UCMit-KIy5J9MTfxTuOZshbA';
const UPLOADS_PLAYLIST_ID = 'UUMit-KIy5J9MTfxTuOZshbA'; // UC→UU
const CREDENTIALS_PATH = path.join(import.meta.dirname, 'google-oauth-credentials.json');
const TOKEN_PATH = path.join(import.meta.dirname, '.google-token.json');
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

// Supabase staging
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db-staging.neramclasses.com';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Auth ────────────────────────────────────────────────────────────────────

function loadCredentials() {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  return JSON.parse(content).installed;
}

async function getAuthenticatedClient() {
  const creds = loadCredentials();
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'http://localhost:3333'
  );

  // Check for cached token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);

    // Refresh if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      console.log('🔄 Refreshing expired token...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2));
    }

    return oauth2Client;
  }

  // First time: browser auth flow
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n📋 Opening browser for Google authorization...');
  console.log('If browser does not open, visit this URL manually:');
  console.log(authUrl);

  // Open browser
  const { default: open } = await import('open');
  open(authUrl);

  // Wait for callback
  const code = await waitForAuthCode();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✅ Token saved for future runs.\n');

  return oauth2Client;
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url || '', true);
      const code = parsed.query.code as string;

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end('No code found');
        server.close();
        reject(new Error('No auth code received'));
      }
    });
    server.listen(3333, () => {
      console.log('⏳ Waiting for authorization on http://localhost:3333 ...');
    });
    // Timeout after 10 minutes
    setTimeout(() => { server.close(); reject(new Error('Auth timeout')); }, 600000);
  });
}

// ── YouTube Fetching ────────────────────────────────────────────────────────

function parseDuration(iso: string): number {
  // PT1H2M3S → seconds
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

interface VideoData {
  youtube_video_id: string;
  youtube_channel_id: string;
  original_title: string;
  original_description: string;
  youtube_thumbnail_url: string | null;
  youtube_thumbnail_hq_url: string | null;
  duration_seconds: number;
  published_at: string;
  privacy_status: string;
}

async function fetchAllVideoIds(youtube: ReturnType<typeof google.youtube>): Promise<string[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  let page = 0;

  console.log('📥 Fetching video IDs from uploads playlist...');

  do {
    page++;
    const res = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId: UPLOADS_PLAYLIST_ID,
      maxResults: 50,
      pageToken,
    });

    const items = res.data.items || [];
    for (const item of items) {
      if (item.contentDetails?.videoId) {
        videoIds.push(item.contentDetails.videoId);
      }
    }

    pageToken = res.data.nextPageToken || undefined;
    console.log(`  Page ${page}: ${items.length} videos (total: ${videoIds.length})`);
  } while (pageToken);

  return videoIds;
}

async function fetchVideoDetails(
  youtube: ReturnType<typeof google.youtube>,
  videoIds: string[]
): Promise<VideoData[]> {
  const results: VideoData[] = [];

  // YouTube API allows max 50 IDs per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'status'],
      id: batch,
    });

    for (const item of res.data.items || []) {
      const snippet = item.snippet!;
      const details = item.contentDetails!;
      const status = item.status!;
      const thumbs = snippet.thumbnails || {};

      results.push({
        youtube_video_id: item.id!,
        youtube_channel_id: snippet.channelId || CHANNEL_ID,
        original_title: snippet.title || '',
        original_description: snippet.description || '',
        youtube_thumbnail_url: thumbs.medium?.url || thumbs.default?.url || null,
        youtube_thumbnail_hq_url: thumbs.maxres?.url || thumbs.high?.url || null,
        duration_seconds: parseDuration(details.duration || ''),
        published_at: snippet.publishedAt || new Date().toISOString(),
        privacy_status: status.privacyStatus || 'unlisted',
      });
    }

    console.log(`  Details: ${Math.min(i + 50, videoIds.length)}/${videoIds.length}`);
  }

  return results;
}

// ── Supabase Insert ─────────────────────────────────────────────────────────

async function syncToSupabase(videos: VideoData[]) {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY env var is required.');
    console.error('   Set it or add to apps/nexus/.env.local and run:');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=... npx tsx library-sync.ts');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get existing video IDs to avoid duplicates
  const { data: existing } = await supabase
    .from('library_videos')
    .select('youtube_video_id');

  const existingIds = new Set((existing || []).map((v: any) => v.youtube_video_id));
  const newVideos = videos.filter(v => !existingIds.has(v.youtube_video_id));

  console.log(`\n📊 ${videos.length} total, ${existingIds.size} already in DB, ${newVideos.length} new`);

  if (newVideos.length === 0) {
    console.log('✅ Nothing to insert — all videos already synced.');
    return;
  }

  // Insert in batches of 50
  let inserted = 0;
  for (let i = 0; i < newVideos.length; i += 50) {
    const batch = newVideos.slice(i, i + 50);
    const { error } = await supabase.from('library_videos').insert(batch);

    if (error) {
      console.error(`❌ Insert error at batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  Inserted: ${inserted}/${newVideos.length}`);
    }
  }

  // Create sync log entry
  await supabase.from('library_sync_log').insert({
    total_videos_found: videos.length,
    new_videos_added: inserted,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  console.log(`\n✅ Sync complete! ${inserted} new videos added to library.`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎬 Neram Video Library Sync');
  console.log('═══════════════════════════\n');

  // Authenticate
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  // Fetch all video IDs
  const videoIds = await fetchAllVideoIds(youtube);
  console.log(`\n📹 Found ${videoIds.length} videos in channel.\n`);

  if (videoIds.length === 0) {
    console.log('No videos found. Check channel ID.');
    return;
  }

  // Fetch full details for each video
  console.log('📋 Fetching video details...');
  const videos = await fetchVideoDetails(youtube, videoIds);

  // Sync to Supabase
  await syncToSupabase(videos);

  console.log('\n🎯 Next steps:');
  console.log('  1. Run classification: npx tsx library-classify.ts');
  console.log('  2. Review in Nexus: /teacher/library/review');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
