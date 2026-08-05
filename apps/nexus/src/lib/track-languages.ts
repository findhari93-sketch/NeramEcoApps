/**
 * Which languages a Foundation chapter can be recorded in.
 *
 * Stored as one `nexus_settings` row under `study_track_languages`, the same
 * table and shape as `feature_flags` and `recap_defaults`. Adding Hindi is then
 * an admin editing a list in the Class recordings dialog, not a migration plus
 * five code edits plus a deploy.
 *
 * It used to be five copies of the same three-item list: the CHECK constraint,
 * the TrackLanguage union, the default-label map, the sort order, the API's
 * validation array and the dialog's dropdown. Five places to remember and no
 * test that they agreed.
 *
 * The LABEL is data for the same reason it is a column on the row: apps/nexus
 * has no i18n framework, so "தமிழ்" cannot come from a translation catalogue
 * that does not exist. Putting Tamil script in an otherwise all-English .tsx is
 * how it got there the first time.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the API routes, the dialog
 * and the student picker can all read it.
 */

/** The settings key under which the offered languages live in `nexus_settings`. */
export const TRACK_LANGUAGES_KEY = 'study_track_languages';

export interface TrackLanguageOption {
  /** Stored in nexus_class_recaps.language. Lowercase, e.g. 'en', 'ta', 'ta_en'. */
  code: string;
  /** What the picker shows, e.g. 'English' or 'தமிழ்'. */
  label: string;
}

/**
 * Used when the settings row is missing or unreadable, and seeded into the
 * editor the first time an admin opens it.
 *
 * ONE ENTRY IS ONE RECORDING, in that language. The original migration's CHECK
 * also allowed 'ta_en', a single video in which both languages are spoken, and
 * carrying it here was a mistake: sitting in a row of "add a language" chips,
 * "Tamil + English" reads as "add both at once", which is the opposite of what
 * it does. The first teacher to open the dialog picked it for exactly that
 * reason. Nothing had ever used it, on either environment.
 *
 * A genuinely code-mixed recording is still possible: an admin adds it from
 * Manage languages, which is what that list is for. It is just not something
 * every chapter is offered by default. Removing it here cannot affect a
 * recording already made, because every track stores its own language_label on
 * the row (see labelForCode below).
 *
 * Not to be confused with library_videos.language, which is a different table
 * with a different vocabulary and keeps its own 'ta_en'.
 */
export const FALLBACK_TRACK_LANGUAGES: TrackLanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
];

/**
 * The shape chk_class_recaps_language enforces in Postgres, repeated here so a
 * bad code is refused while the admin is typing rather than by a 500 three
 * screens later. Two or three lowercase letters, optionally joined by
 * underscores: 'en', 'ta', 'hi', 'ml', 'ta_en'.
 */
export const TRACK_LANGUAGE_CODE_RE = /^[a-z]{2,3}(_[a-z]{2,3})*$/;

export function isValidTrackLanguageCode(code: unknown): boolean {
  return typeof code === 'string' && TRACK_LANGUAGE_CODE_RE.test(code.trim().toLowerCase());
}

/**
 * Coerce whatever is in the JSONB into a list the routes can rely on.
 *
 * Drops rather than throws. A single malformed entry someone hand-edited into
 * the settings row must not take the whole chapter screen down with it, and the
 * caller has no useful way to react to "entry 3 was bad" anyway.
 */
export function normaliseTrackLanguages(raw: unknown): TrackLanguageOption[] {
  if (!Array.isArray(raw)) return [...FALLBACK_TRACK_LANGUAGES];

  const out: TrackLanguageOption[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const code = String((entry as Record<string, unknown>).code ?? '')
      .trim()
      .toLowerCase();
    const label = String((entry as Record<string, unknown>).label ?? '').trim();
    if (!TRACK_LANGUAGE_CODE_RE.test(code)) continue;
    // A blank label would render an empty button in the student picker, which
    // reads as a broken chapter rather than as a missing label.
    if (!label) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label });
  }

  // An empty list is never what anyone meant, and it would leave a chapter with
  // no way to add any recording at all.
  return out.length ? out : [...FALLBACK_TRACK_LANGUAGES];
}

/**
 * Read the offered languages. Never throws; falls back on any problem.
 *
 * Same contract as readRecapDefaults: opening a chapter must not depend on a
 * settings row being present, parseable, or reachable.
 */
export async function readTrackLanguages(supabase: any): Promise<TrackLanguageOption[]> {
  try {
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('value')
      .eq('key', TRACK_LANGUAGES_KEY)
      .maybeSingle();
    if (error || !data) return [...FALLBACK_TRACK_LANGUAGES];
    return normaliseTrackLanguages(data.value);
  } catch {
    return [...FALLBACK_TRACK_LANGUAGES];
  }
}

/** The order tracks are listed in: the order the admin put them in. */
export function trackLanguageOrder(languages: TrackLanguageOption[]): string[] {
  return languages.map((l) => l.code);
}

/**
 * The label to store on a new track.
 *
 * Stored rather than looked up at read time so that removing a language from
 * the offered list never blanks the picker button on a chapter that already
 * uses it. Falls back to the raw code, which is ugly but legible, and is the
 * only thing left to show if a caller passes a language nobody configured.
 */
export function labelForCode(languages: TrackLanguageOption[], code: string): string {
  return languages.find((l) => l.code === code)?.label || code;
}
