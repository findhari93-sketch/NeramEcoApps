/**
 * Where a student's current profile photo actually came from.
 *
 * This matters because most photos in the review queue were never submitted by
 * anyone. On the live classroom today, 17 of 21 "submissions" were pulled from
 * Microsoft by a background job and 4 more are Google account pictures that
 * arrived automatically at sign-in. Only 1 was a deliberate Nexus upload. A
 * teacher judging a face needs to know which of those they are looking at, and
 * a Google picture in particular was never offered as a face photo.
 *
 * Pure: no Supabase, no fetch, so the classification is unit-testable.
 */

export type PhotoOrigin = 'upload' | 'microsoft' | 'google' | 'other';

/** Google's avatar CDN, used by Firebase/Google sign-in. */
const GOOGLE_AVATAR_HOSTS = ['googleusercontent.com'];

/** Path marker the admin Microsoft photo sync writes into the documents bucket. */
const MS_AVATAR_PATH = '/ms-avatars/';

/** Bucket the Nexus profile upload writes into. */
const UPLOAD_BUCKET_PATH = '/profile-pictures/';

export interface PhotoOriginInput {
  /** user_avatars.source for the row currently marked is_current, if any. */
  avatarSource?: string | null;
  /** users.avatar_url. */
  avatarUrl?: string | null;
}

/**
 * Returns null when there is no photo at all, so callers can distinguish
 * "nothing to judge" from "something of unknown provenance".
 */
export function resolvePhotoOrigin(input: PhotoOriginInput): PhotoOrigin | null {
  const url = (input.avatarUrl || '').trim();
  if (!url) return null;

  // A user_avatars row is the authoritative record: it is written by whichever
  // code path stored the image, so it beats guessing from the URL.
  const source = (input.avatarSource || '').trim().toLowerCase();
  if (source === 'upload') return 'upload';
  if (source === 'microsoft') return 'microsoft';
  if (source === 'google') return 'google';

  // No avatar row. This is the Google sign-in case: the URL points straight at
  // Google's CDN and we never stored a copy, so nothing recorded a source.
  const lower = url.toLowerCase();
  if (GOOGLE_AVATAR_HOSTS.some((host) => lower.includes(host))) return 'google';
  if (lower.includes(MS_AVATAR_PATH)) return 'microsoft';
  if (lower.includes(UPLOAD_BUCKET_PATH)) return 'upload';

  return 'other';
}

/** Short label for the review card. Deliberately plain language. */
export function photoOriginLabel(origin: PhotoOrigin | null): string | null {
  switch (origin) {
    case 'upload':
      return 'Uploaded in Nexus';
    case 'microsoft':
      return 'From Microsoft';
    case 'google':
      return 'From Google sign-in';
    case 'other':
      return 'Source unknown';
    default:
      return null;
  }
}

/**
 * True when the photo lives somewhere we do not control and could disappear.
 * A Google CDN URL keeps working only while Google serves it, so approving one
 * has to copy it into our own storage first.
 */
export function isExternallyHosted(origin: PhotoOrigin | null): boolean {
  return origin === 'google' || origin === 'other';
}
