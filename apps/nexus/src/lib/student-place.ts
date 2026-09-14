/**
 * Where a student lives, read from their application form.
 *
 * lead_profiles.city is the only place a student's location is stored: neither
 * users nor student_profiles carries one. One student can hold several
 * lead_profiles rows (a draft, a direct-link form, a form staff started), and
 * occasionally those rows disagree about the city, so exactly one rule decides
 * which row wins: the NEWEST row that actually names a city.
 *
 * "Newest" rather than "first" on purpose. PostgREST returns rows in no
 * guaranteed order, so picking the first one made the same student land in
 * different cities on different requests. The roster row and the City-Wise
 * counts both go through here, so the two can never disagree on screen.
 *
 * Pure, with no database import, so a client component can format a place with
 * the same rules the server picked it by. It must never import geo-students:
 * that would pull the admin Supabase client into a browser bundle.
 */

/** Capitalise each word so "tamil nadu" -> "Tamil Nadu" (matches the SQL INITCAP output). */
export function titleCasePlace(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export interface StudentPlace {
  city: string;
  state: string | null;
}

/** A lead_profiles row, narrowed to the fields this picks by. */
export interface PlaceRow {
  city?: string | null;
  state?: string | null;
  created_at?: string | null;
}

function timeOf(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  // An unreadable created_at sorts oldest rather than poisoning the comparison.
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The newest of a student's rows that names a city, whole. Callers needing more
 * of the row than the city and state (a district, a country) read it from here,
 * so every surface still picks the SAME row.
 */
export function pickPlaceRow<T extends PlaceRow>(rows: readonly T[] | null | undefined): T | null {
  let best: T | null = null;
  let bestTime = -1;
  for (const row of rows || []) {
    if (!titleCasePlace(row.city)) continue;
    const time = timeOf(row.created_at);
    if (time <= bestTime) continue;
    bestTime = time;
    best = row;
  }
  return best;
}

/** The newest of a student's rows that names a city, title-cased. Null when none does. */
export function pickStudentPlace(rows: readonly PlaceRow[] | null | undefined): StudentPlace | null {
  const row = pickPlaceRow(rows);
  if (!row) return null;
  return { city: titleCasePlace(row.city)!, state: titleCasePlace(row.state) };
}

/**
 * "Chennai, Tamil Nadu" for a roster line. The city alone when there is no
 * state, or when a one-city state repeats it ("Delhi, Delhi" reads as an error).
 */
export function placeLabel(place: StudentPlace | null | undefined): string | null {
  if (!place?.city) return null;
  const { city, state } = place;
  if (!state || state.toLowerCase() === city.toLowerCase()) return city;
  return `${city}, ${state}`;
}
