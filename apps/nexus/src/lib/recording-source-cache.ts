/**
 * Resolve a video reference to something bytes can be pulled from, and remember
 * the answer for a few minutes.
 *
 * Resolving costs one Supabase read plus two Microsoft Graph calls. A single
 * watch is hundreds of range requests, so paying that per request would be both
 * slow and a good way to get throttled by Graph. Cached, a cold instance pays it
 * once and every subsequent chunk is free.
 *
 * This is process memory with a TTL, not persistence. recording-source.ts states
 * plainly that the download URL is NEVER PERSISTED, because it expires in well
 * under an hour and a stale one answers 403. Holding it in a Map for 10 minutes
 * respects that: nothing survives a restart, nothing is written anywhere, and the
 * TTL is far inside the URL's own lifetime. A long class still outlives the URL,
 * which is why callers evict and re-resolve once on an upstream 403 or 410
 * rather than treating it as a dead recording.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { resolveRecordingSource } from './recording-source';
import type { VideoScope } from './video-token';

/** Comfortably inside the "well under an hour" the Graph URL is good for. */
const TTL_MS = 10 * 60 * 1000;

/** A runaway-growth backstop; entries are small and expire on their own. */
const MAX_ENTRIES = 200;

export interface ResolvedMedia {
  downloadUrl: string;
  /** Exact total byte count, needed for Content-Range and for 416. */
  size: number;
  mime: string;
  itemId: string | null;
}

interface CacheEntry extends ResolvedMedia {
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

const keyOf = (scope: VideoScope, refId: string) => `${scope}:${refId}`;

/** Where each scope keeps the URL of the underlying file. */
const SOURCE_COLUMN: Record<VideoScope, { table: string; column: string }> = {
  recap: { table: 'nexus_class_recaps', column: 'recording_url' },
  class: { table: 'nexus_scheduled_classes', column: 'recording_url' },
  foundation: { table: 'nexus_foundation_chapters', column: 'sharepoint_video_url' },
};

async function readSourceUrl(scope: VideoScope, refId: string): Promise<string> {
  const { table, column } = SOURCE_COLUMN[scope];
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase.from(table).select(column).eq('id', refId).maybeSingle();
  if (error) throw new Error(`MEDIA_LOOKUP_FAILED: ${error.message}`);
  const url = data?.[column];
  if (!url) throw new Error('MEDIA_NOT_FOUND');
  return url as string;
}

/** Drop the oldest entries once the map grows past its cap. */
function evictOverflow(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const byAge = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  for (const [k] of byAge.slice(0, cache.size - MAX_ENTRIES)) cache.delete(k);
}

/**
 * Resolve, using the cached answer when it is still fresh.
 * Throws MEDIA_NOT_FOUND, MEDIA_LOOKUP_FAILED, or whatever resolveRecordingSource
 * raises (notably RECORDING_SIZE_UNKNOWN, which means we cannot serve ranges
 * honestly and must not pretend otherwise).
 */
export async function resolveMedia(scope: VideoScope, refId: string): Promise<ResolvedMedia> {
  const key = keyOf(scope, refId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < TTL_MS) {
    const { cachedAt: _ignored, ...media } = hit;
    return media;
  }

  const sourceUrl = await readSourceUrl(scope, refId);
  const source = await resolveRecordingSource(sourceUrl);

  const media: ResolvedMedia = {
    downloadUrl: source.downloadUrl,
    size: source.size,
    // Recordings are mp4 and the driveItem does not always carry a usable type.
    // Guessing wrong here makes the media element refuse to play at all.
    mime: guessMime(source.name),
    itemId: source.itemId,
  };

  cache.set(key, { ...media, cachedAt: Date.now() });
  evictOverflow();
  return media;
}

/** Forget a resolution, e.g. after the upstream URL expired mid-watch. */
export function evictMedia(scope: VideoScope, refId: string): void {
  cache.delete(keyOf(scope, refId));
}

/** Test seam: drop everything. */
export function clearMediaCache(): void {
  cache.clear();
}

function guessMime(name: string | null): string {
  const ext = (name || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'webm':
      return 'video/webm';
    case 'm4v':
      return 'video/x-m4v';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'video/mp4';
  }
}
