import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, upsertNexusSetting } from '@neram/database';
import { getRequestUser, assertStaff, assertCapability } from '@/lib/study-materials';
import {
  TRACK_LANGUAGES_KEY,
  readTrackLanguages,
  normaliseTrackLanguages,
  TRACK_LANGUAGE_CODE_RE,
} from '@/lib/track-languages';

/**
 * Which languages a Foundation chapter can be recorded in.
 *
 *   GET -> the offered list, plus how many chapters currently use each one, so
 *          an admin about to remove a language can see what it would affect.
 *   PUT -> replace the list. Body: { languages: [{ code, label }] }
 *
 * A dedicated route rather than the generic /api/settings, for three reasons
 * that all bite: the generic GET is public and would hand back the raw JSONB
 * unnormalised, the usage counts have nowhere to live on it, and normalising on
 * the way IN means a malformed entry is refused while the admin is looking at
 * it rather than silently dropped on every later read.
 *
 * Editing the list is admin-only (`system.settings`), the same gate as the
 * feature flags. Reading it is any staff, because the tracks dialog needs it to
 * render a slot per language and a teacher must be able to open that dialog.
 */

/** How many live tracks exist per language. Archived rows do not count. */
async function usageByLanguage(): Promise<Record<string, number>> {
  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase
    .from('nexus_class_recaps')
    .select('language')
    .not('study_file_id', 'is', null)
    .neq('status', 'archived');

  const out: Record<string, number> = {};
  for (const row of data || []) {
    if (!row?.language) continue;
    out[row.language] = (out[row.language] || 0) + 1;
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const [languages, usage] = await Promise.all([
      readTrackLanguages(getSupabaseAdminClient()),
      usageByLanguage(),
    ]);

    return NextResponse.json({ languages, usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the language list';
    const status = (err as { status?: number }).status ?? (message === 'Not authorized' ? 403 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'system.settings');

    const body = await request.json().catch(() => ({}));
    const raw = Array.isArray(body?.languages) ? body.languages : null;
    if (!raw) {
      return NextResponse.json({ error: 'Send a languages array' }, { status: 400 });
    }

    // Name the offending entry rather than dropping it. normaliseTrackLanguages
    // is deliberately forgiving because it runs on every read and must never
    // take a chapter screen down, but here there is a human watching who can fix
    // the typo, and silently swallowing it would leave them wondering why the
    // language they just added is not in the list.
    for (const entry of raw) {
      const code = String(entry?.code ?? '').trim().toLowerCase();
      const label = String(entry?.label ?? '').trim();
      if (!TRACK_LANGUAGE_CODE_RE.test(code)) {
        return NextResponse.json(
          {
            error: `"${entry?.code ?? ''}" is not a usable code. Use two or three lowercase letters, joined by underscores for a mixed recording: en, ta, hi, ta_en.`,
          },
          { status: 400 },
        );
      }
      if (!label) {
        return NextResponse.json(
          { error: `Give "${code}" a name. It is what students see on the picker button.` },
          { status: 400 },
        );
      }
    }

    const languages = normaliseTrackLanguages(raw);
    if (!languages.length) {
      return NextResponse.json({ error: 'Keep at least one language' }, { status: 400 });
    }

    // Removing a language is allowed even when chapters use it, and that is not
    // an oversight. Every existing track keeps its own language_label on the
    // row, so students carry on seeing it exactly as before; the list only
    // decides what can be added NEXT. Refusing here would mean an admin could
    // never retire a language without first deleting real recordings.
    await upsertNexusSetting(TRACK_LANGUAGES_KEY, languages, user.id);

    return NextResponse.json({ languages, usage: await usageByLanguage() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save the language list';
    const status = (err as { status?: number }).status ?? (message === 'Not authorized' ? 403 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
