/**
 * City-tagged class clips and reviews (social_proofs.city_slug) for the city
 * pages and the video sitemap. Only tagged videos appear: the same general
 * video on hundreds of city pages would add weight, not local value.
 */
import { unstable_cache } from 'next/cache';
import { createAdminClientISR } from '@neram/database';
import { generateVideoObjectSchema } from './schemas';

export const VIDEO_REVALIDATE = 86400;

export interface CityVideo {
  youtubeId: string;
  title: string;
  description: string;
  language: string | null;
  citySlug: string;
  addedAt: string;
}

interface Row {
  youtube_id: string | null;
  caption: string | null;
  description: unknown;
  speaker_name: string | null;
  language: string | null;
  city_slug: string | null;
  created_at: string | null;
  display_order: number | null;
}

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.en ?? Object.values(o).find((x) => typeof x === 'string') ?? '');
  }
  return '';
}

export function toCityVideo(r: Row): CityVideo | null {
  if (!r.youtube_id || !r.city_slug || !/^[\w-]{11}$/.test(r.youtube_id)) return null;
  const description = text(r.description).trim();
  const title = (r.caption || description.split(/[.!?]/)[0] || `Neram Classes ${r.city_slug} video`).trim().slice(0, 100);
  return {
    youtubeId: r.youtube_id,
    title,
    description: description || title,
    language: r.language,
    citySlug: r.city_slug,
    addedAt: (r.created_at ?? new Date().toISOString()).slice(0, 10),
  };
}

export const getCityVideos = unstable_cache(
  async (): Promise<CityVideo[]> => {
    try {
      const { data, error } = await (createAdminClientISR(VIDEO_REVALIDATE).from('social_proofs' as never) as any)
        .select('youtube_id, caption, description, speaker_name, language, city_slug, created_at, display_order')
        .eq('is_active', true)
        .not('city_slug', 'is', null)
        .not('youtube_id', 'is', null)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return ((data as Row[]) ?? []).map(toCityVideo).filter((v): v is CityVideo => v !== null);
    } catch {
      // Column not migrated yet on this database, or a read error: no videos.
      return [];
    }
  },
  ['marketing-city-videos-v1'],
  { revalidate: VIDEO_REVALIDATE, tags: ['geo-facts'] },
);

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function cityVideoSchema(v: CityVideo) {
  return generateVideoObjectSchema({
    name: v.title,
    description: v.description,
    thumbnailUrl: youtubeThumb(v.youtubeId),
    uploadDate: v.addedAt,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtubeId}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.youtubeId}`,
  });
}
