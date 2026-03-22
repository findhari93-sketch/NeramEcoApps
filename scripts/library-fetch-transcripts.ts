/**
 * YouTube Transcript Fetch Script
 *
 * Fetches auto-generated captions/transcripts for library videos
 * and saves them to the library_videos table in Supabase.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx library-fetch-transcripts.ts
 *
 * Options:
 *   --limit N       Process only N videos (default: all)
 *   --dry-run       Print what would be done without writing to DB
 *   --reclassify    After fetching, flag low-confidence videos for reclassification
 *   --force         Re-fetch transcripts even if already fetched
 */

import { YoutubeTranscript, type TranscriptResponse } from 'youtube-transcript';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db-staging.neramclasses.com';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CONCURRENCY = 5;

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const reclassify = args.includes('--reclassify');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;

// ── Clients ─────────────────────────────────────────────────────────────────
function getSupabase(): SupabaseClient {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY env var is required.');
    process.exit(1);
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── Types ───────────────────────────────────────────────────────────────────
interface LibraryVideo {
  id: string;
  youtube_video_id: string;
  original_title: string | null;
  transcript_text: string | null;
  transcript_status: string | null;
  ai_confidence: number | null;
  classification_status: string | null;
}

interface TranscriptResult {
  videoId: string;
  youtubeId: string;
  title: string | null;
  success: boolean;
  transcriptText?: string;
  segments?: TranscriptResponse[];
  language?: string;
  error?: string;
}

// ── Fetch transcript for a single video ─────────────────────────────────────
async function fetchTranscriptForVideo(video: LibraryVideo): Promise<TranscriptResult> {
  const { id, youtube_video_id, original_title } = video;

  try {
    // Try English first, then fall back to any available language
    let segments: TranscriptResponse[];
    let language = 'en';

    try {
      segments = await YoutubeTranscript.fetchTranscript(youtube_video_id, { lang: 'en' });
    } catch {
      // Fall back to Tamil
      try {
        segments = await YoutubeTranscript.fetchTranscript(youtube_video_id, { lang: 'ta' });
        language = 'ta';
      } catch {
        // Fall back to any available language
        segments = await YoutubeTranscript.fetchTranscript(youtube_video_id);
        language = segments[0]?.lang || 'unknown';
      }
    }

    if (!segments || segments.length === 0) {
      return {
        videoId: id,
        youtubeId: youtube_video_id,
        title: original_title,
        success: false,
        error: 'No transcript segments returned',
      };
    }

    // Combine segments into full text
    const transcriptText = segments.map((s) => s.text).join(' ');

    return {
      videoId: id,
      youtubeId: youtube_video_id,
      title: original_title,
      success: true,
      transcriptText,
      segments,
      language,
    };
  } catch (err: any) {
    return {
      videoId: id,
      youtubeId: youtube_video_id,
      title: original_title,
      success: false,
      error: err.message || String(err),
    };
  }
}

// ── Process batch with concurrency control ──────────────────────────────────
async function processBatch(
  videos: LibraryVideo[],
  concurrency: number,
  processor: (video: LibraryVideo) => Promise<TranscriptResult>
): Promise<TranscriptResult[]> {
  const results: TranscriptResult[] = [];
  let index = 0;

  async function worker() {
    while (index < videos.length) {
      const current = index++;
      const video = videos[current];
      const result = await processor(video);
      results.push(result);

      const status = result.success ? '✅' : '❌';
      const truncTitle = (video.original_title || video.youtube_video_id).slice(0, 60);
      console.log(
        `  ${status} [${results.length}/${videos.length}] ${truncTitle}` +
          (result.success
            ? ` (${result.segments?.length} segments, lang: ${result.language})`
            : ` — ${result.error}`)
      );
    }
  }

  // Spawn workers
  const workers = Array.from({ length: Math.min(concurrency, videos.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

// ── Save results to Supabase ────────────────────────────────────────────────
async function saveResults(supabase: SupabaseClient, results: TranscriptResult[]): Promise<void> {
  let saved = 0;
  let failed = 0;

  for (const result of results) {
    if (result.success && result.transcriptText) {
      const { error } = await supabase
        .from('library_videos')
        .update({
          transcript_text: result.transcriptText,
          transcript_status: 'fetched',
          transcript_language: result.language || null,
          transcript_is_generated: true,
          transcript_segments: result.segments
            ? result.segments.map((s) => ({
                text: s.text,
                offset: s.offset,
                duration: s.duration,
              }))
            : null,
        })
        .eq('id', result.videoId);

      if (error) {
        console.error(`  ⚠️ DB update failed for ${result.youtubeId}: ${error.message}`);
        failed++;
      } else {
        saved++;
      }
    } else {
      const { error } = await supabase
        .from('library_videos')
        .update({
          transcript_status: 'unavailable',
        })
        .eq('id', result.videoId);

      if (error) {
        console.error(`  ⚠️ DB update failed for ${result.youtubeId}: ${error.message}`);
        failed++;
      } else {
        saved++;
      }
    }
  }

  console.log(`\n💾 DB updates: ${saved} saved, ${failed} errors`);
}

// ── Reclassify low-confidence videos ────────────────────────────────────────
async function flagLowConfidenceForReclassification(supabase: SupabaseClient): Promise<void> {
  console.log('\n🔄 Flagging low-confidence videos with transcripts for reclassification...');

  // Find videos that:
  //   - Have a transcript now
  //   - Have ai_confidence < 0.5 (or were classified without transcript)
  //   - Are already classified
  const { data: videos, error } = await supabase
    .from('library_videos')
    .select('id, youtube_video_id, original_title, ai_confidence, classification_status')
    .eq('transcript_status', 'fetched')
    .not('transcript_text', 'is', null)
    .lt('ai_confidence', 0.5)
    .eq('classification_status', 'classified');

  if (error) {
    console.error(`❌ Failed to query low-confidence videos: ${error.message}`);
    return;
  }

  if (!videos || videos.length === 0) {
    console.log('  No low-confidence classified videos with transcripts found.');
    return;
  }

  console.log(`  Found ${videos.length} low-confidence videos to flag for reclassification.`);

  if (dryRun) {
    for (const v of videos) {
      console.log(`  [DRY RUN] Would flag: ${(v.original_title || v.youtube_video_id).slice(0, 60)} (confidence: ${v.ai_confidence})`);
    }
    return;
  }

  // Reset classification_status to 'pending' so the classify script picks them up
  const ids = videos.map((v) => v.id);
  const { error: updateError, count } = await supabase
    .from('library_videos')
    .update({
      classification_status: 'pending',
      classification_error: null,
    })
    .in('id', ids);

  if (updateError) {
    console.error(`❌ Failed to flag videos: ${updateError.message}`);
  } else {
    console.log(`  ✅ Flagged ${count ?? ids.length} videos for reclassification (classification_status → pending)`);
    console.log('  Run library-classify.ts with --force to reclassify them with transcript context.');
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🎬 YouTube Transcript Fetcher');
  console.log('─'.repeat(60));
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Dry run:      ${dryRun}`);
  console.log(`  Force:        ${force}`);
  console.log(`  Reclassify:   ${reclassify}`);
  console.log(`  Limit:        ${limit || 'all'}`);
  console.log(`  Concurrency:  ${CONCURRENCY}`);
  console.log('─'.repeat(60));

  const supabase = getSupabase();

  // Build query for videos needing transcripts
  let query = supabase
    .from('library_videos')
    .select('id, youtube_video_id, original_title, transcript_text, transcript_status, ai_confidence, classification_status');

  if (force) {
    // Re-fetch all, regardless of current status
    // Still skip videos without a youtube_video_id
    query = query.not('youtube_video_id', 'is', null);
  } else {
    // Only fetch videos where transcript is null or status is pending/error
    query = query.or('transcript_text.is.null,transcript_status.eq.pending,transcript_status.eq.error');
  }

  query = query.order('published_at', { ascending: false });

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: videos, error } = await query;

  if (error) {
    console.error(`❌ Failed to fetch videos: ${error.message}`);
    process.exit(1);
  }

  if (!videos || videos.length === 0) {
    console.log('✅ No videos need transcripts. All done!');
    if (reclassify) {
      await flagLowConfidenceForReclassification(supabase);
    }
    return;
  }

  console.log(`\n📋 Found ${videos.length} videos needing transcripts.\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN — would fetch transcripts for:');
    for (const v of videos) {
      console.log(`  - ${(v.original_title || v.youtube_video_id).slice(0, 70)} (${v.youtube_video_id})`);
    }
    console.log(`\nTotal: ${videos.length} videos`);

    if (reclassify) {
      await flagLowConfidenceForReclassification(supabase);
    }
    return;
  }

  // Fetch transcripts with concurrency
  console.log(`⏳ Fetching transcripts (${CONCURRENCY} concurrent)...\n`);
  const results = await processBatch(videos as LibraryVideo[], CONCURRENCY, fetchTranscriptForVideo);

  // Summary
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log('\n' + '─'.repeat(60));
  console.log('📊 Summary:');
  console.log(`  Total processed: ${results.length}`);
  console.log(`  Transcripts fetched: ${successful.length}`);
  console.log(`  Failed/Unavailable: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\n  Failed videos:');
    for (const f of failed) {
      console.log(`    - ${(f.title || f.youtubeId).slice(0, 50)}: ${f.error}`);
    }
  }

  // Save to DB
  console.log('\n💾 Saving results to Supabase...');
  await saveResults(supabase, results);

  // Reclassify low-confidence videos if requested
  if (reclassify) {
    await flagLowConfidenceForReclassification(supabase);
  }

  console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
