/**
 * Small pure pieces of the teacher's Slides tab (ChapterSlidesPanel), kept here
 * so they are tested without rendering the panel.
 *
 * Client safe: no server imports. The response shape mirrors SlidesPayload in
 * lib/study-slides.ts, which is server only.
 */

/** The SharePoint file behind a chapter's slides, as the staff branch of GET /slides returns it. */
export interface StaffSlidesSource {
  name: string;
  web_url: string | null;
  modified_at: string | null;
  converted_at: string | null;
  checked_at: string | null;
  size_bytes: number | null;
  problem: string | null;
}

export interface StaffSlides {
  status: 'ready' | 'unavailable';
  url?: string;
  expires_in?: number;
  version?: string | null;
  code?: string;
  source?: StaffSlidesSource;
}

/**
 * What to send to PUT /slides for a file picked in Nexus.
 *
 * The ids when the row has them, because the webUrl a SharePoint search returns
 * is often a list form page (Forms/DispForm.aspx?ID=12) rather than the file.
 * The link otherwise, which the route resolves through /shares.
 */
export function slidesAttachBody(item: {
  id: string;
  driveId?: string | null;
  webUrl: string;
}): { drive_id: string; item_id: string } | { url: string } {
  if (item.driveId && item.id) return { drive_id: item.driveId, item_id: item.id };
  return { url: item.webUrl };
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago", then a date. Empty when unknown. */
export function formatAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One line under the deck's name: when Nexus last checked SharePoint, and when this version was made. */
export function slidesSourceLine(source: StaffSlidesSource | undefined, now: number = Date.now()): string {
  if (!source) return '';
  const checked = formatAgo(source.checked_at, now);
  const made = formatAgo(source.converted_at, now);
  return [checked && `Checked with SharePoint ${checked}`, made && `This version made ${made}`]
    .filter(Boolean)
    .join('. ');
}
