/**
 * Pure helpers for a classroom's own city page: the street line, the Google
 * Maps embed and the "Rated 4.7 on Google" line. Unit tested.
 */
import type { ClassroomCentre } from './facts';

/** The street part only: drops a bare city row and a trailing ", {city}" the row repeats. */
export function streetOnly(address: string | null | undefined, city: string): string | null {
  const a = (address ?? '').trim().replace(/[,\s]+$/, '');
  const c = city.trim().toLowerCase();
  if (!a || a.toLowerCase() === c) return null;
  const parts = a.split(',').map((p) => p.trim());
  if (parts.length > 1 && parts[parts.length - 1].toLowerCase() === c) parts.pop();
  return parts.join(', ') || null;
}

/** "2/401, IInd Floor, Vasanth Nagar, Palangantham, Madurai, Tamil Nadu 625003". */
export function fullAddressLine(c: Pick<ClassroomCentre, 'address' | 'city' | 'state' | 'pincode'>): string {
  const street = streetOnly(c.address, c.city);
  return `${street ? `${street}, ` : ''}${c.city}, ${c.state}${c.pincode ? ` ${c.pincode}` : ''}`;
}

/**
 * Keyless Google Maps embed. Searching the business name with the address
 * lands on the centre's own Google profile pin (with its reviews), not a bare
 * coordinate. Without a street we fall back to the coordinates.
 */
export function mapEmbedUrl(c: Pick<ClassroomCentre, 'name' | 'address' | 'city' | 'state' | 'pincode' | 'lat' | 'lng'>): string {
  const street = streetOnly(c.address, c.city);
  const q = street ? `${c.name}, ${fullAddressLine(c)}` : `${c.lat},${c.lng}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
}

/** A Google rating older than this is hidden: a stale number reads as a false claim. */
export const RATING_MAX_AGE_DAYS = 90;

/** "Rated 4.7 on Google by 37 students (checked 3 Oct 2026)", or null when missing or stale. */
export function googleRatingLine(rating: ClassroomCentre['googleRating'], now: Date = new Date()): string | null {
  if (!rating) return null;
  const checked = new Date(`${rating.checkedAt}T00:00:00+05:30`);
  if (Number.isNaN(checked.getTime())) return null;
  const ageDays = (now.getTime() - checked.getTime()) / 86_400_000;
  if (ageDays < 0 || ageDays > RATING_MAX_AGE_DAYS) return null;
  const date = checked.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const who = rating.count === 1 ? '1 student' : `${rating.count} students`;
  return `Rated ${rating.value.toFixed(1)} on Google by ${who} (checked ${date})`;
}
