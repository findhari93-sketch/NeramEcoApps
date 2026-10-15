/** Public bucket that also holds staff-chosen covers and logos (Admin college-photos). */
export const PHOTO_BUCKET = 'college-photos';

/** Folder for photos a college uploads from its dashboard (live only after staff approve). */
export function photoFolder(collegeId: string): string {
  return `college-submitted/${collegeId}`;
}

/**
 * Only URLs under this prefix are accepted in a photos submission. Built with
 * the same storage client that returns the upload URL, so the host matches
 * whatever Supabase URL (direct or proxied) this environment uses.
 */
export function photoUrlPrefix(db: any, collegeId: string): string {
  const url: string = db.storage.from(PHOTO_BUCKET).getPublicUrl(`${photoFolder(collegeId)}/x`).data.publicUrl;
  return url.slice(0, -1);
}

export const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
