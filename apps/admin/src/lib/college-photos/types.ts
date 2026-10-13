/**
 * Shared shapes for the college photo finder.
 *
 * Everything in this folder uses relative imports only, because the backfill
 * script (apps/admin/scripts/college-photos-backfill.ts) runs it under tsx,
 * which does not know the `@/` alias.
 */

export type PhotoStatus = 'pending' | 'found' | 'partial' | 'not_found' | 'manual';

/** The columns the finder reads. Select exactly these (see COLLEGE_PHOTO_COLUMNS). */
export interface CollegeForPhotos {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  photo_status: PhotoStatus;
  photo_checked_at: string | null;
  photo_attempts: number;
  latitude: number | null;
  longitude: number | null;
  established_year: number | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  youtube_channel_id: string | null;
  aliases: string[] | null;
  wikidata_id: string | null;
}

export const COLLEGE_PHOTO_COLUMNS =
  'id,slug,name,short_name,city,state,website,logo_url,hero_image_url,photo_status,photo_checked_at,photo_attempts,latitude,longitude,established_year,instagram_handle,facebook_url,linkedin_url,youtube_channel_id,aliases,wikidata_id';

export type ImageKind = 'cover' | 'logo';

export type CandidateSource = 'wikidata' | 'commons' | 'wikipedia' | 'site' | 'manifest';

export interface Candidate {
  kind: ImageKind;
  /** The full-size file to download and store. */
  url: string;
  /** A smaller copy for the AI judge, when the host offers one. */
  thumbUrl?: string;
  /** Where the image is described: a Commons file page or the college page it was on. */
  pageUrl: string;
  credit: string;
  license: string;
  width?: number;
  height?: number;
  source: CandidateSource;
  title?: string;
}

/** What Wikidata says about the college, when we are sure it is the same institution. */
export interface EntityFacts {
  wikidataId: string;
  aliases: string[];
  latitude?: number;
  longitude?: number;
  foundedYear?: number;
  website?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  youtubeChannelId?: string;
  commonsCategory?: string;
  imageFile?: string;
  logoFile?: string;
}

export interface ProcessReport {
  slug: string;
  status: PhotoStatus | 'skipped';
  cover?: { url: string; source: CandidateSource; credit: string; license: string };
  logo?: { url: string; source: CandidateSource };
  /** Empty columns that were filled from Wikidata. */
  filled: string[];
  notes: string[];
  candidates: { covers: number; logos: number };
}
