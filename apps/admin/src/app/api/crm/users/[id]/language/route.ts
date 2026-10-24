/**
 * PATCH /api/crm/users/[id]/language
 *
 * Staff record the language a person follows, from the Admin person page or the
 * demo desk. The same two columns Nexus writes (users.home_language and
 * users.limited_english), audited the same way: one user_profile_history row per
 * field that actually changed.
 *
 * Body: { homeLanguage?: LanguageKey | null, limitedEnglish?: boolean }
 * Either may be left out to keep what is stored. null clears the language back
 * to "nobody recorded it", which brings back the grey guess.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, recordUserHistory } from '@neram/database';
import { isHomeLanguageValue } from '@neram/ui/language';
import { getRequestAdminId } from '@/lib/request-admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown person' }, { status: 400 });

  let body: { homeLanguage?: unknown; limitedEnglish?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasLanguage = 'homeLanguage' in body;
  const hasLimited = 'limitedEnglish' in body;
  if (!hasLanguage && !hasLimited) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }
  // Validated raw: 'Tamil', 'ta' or 1 must be refused, not coerced into a key.
  if (hasLanguage && !isHomeLanguageValue(body.homeLanguage)) {
    return NextResponse.json(
      { error: 'homeLanguage must be tamil, hindi, kannada, malayalam, telugu, english or null' },
      { status: 400 },
    );
  }
  if (hasLimited && typeof body.limitedEnglish !== 'boolean') {
    return NextResponse.json({ error: 'limitedEnglish must be true or false' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as any;
  const { data: before, error: readError } = await supabase
    .from('users')
    .select('id, home_language, limited_english')
    .eq('id', params.id)
    .maybeSingle();
  if (readError) {
    console.error('[crm/users/language] read failed', readError);
    return NextResponse.json({ error: 'Could not read this person' }, { status: 500 });
  }
  if (!before) return NextResponse.json({ error: 'Unknown person' }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (hasLanguage && (before.home_language ?? null) !== body.homeLanguage) update.home_language = body.homeLanguage;
  if (hasLimited && (before.limited_english === true) !== body.limitedEnglish) update.limited_english = body.limitedEnglish;

  // A no-op UPDATE would still bump updated_at and write a history row.
  if (Object.keys(update).length) {
    const { error: writeError } = await supabase
      .from('users')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', params.id);
    if (writeError) {
      console.error('[crm/users/language] write failed', writeError);
      return NextResponse.json({ error: 'Could not save the language' }, { status: 500 });
    }
    if ('home_language' in update) {
      await recordUserHistory(supabase, params.id, 'home_language', before.home_language ?? null, update.home_language, adminId);
    }
    if ('limited_english' in update) {
      await recordUserHistory(supabase, params.id, 'limited_english', before.limited_english === true, update.limited_english, adminId);
    }
  }

  return NextResponse.json({
    homeLanguage: 'home_language' in update ? update.home_language : before.home_language ?? null,
    limitedEnglish: 'limited_english' in update ? update.limited_english : before.limited_english === true,
  });
}
