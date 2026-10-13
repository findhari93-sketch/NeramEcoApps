/**
 * Which college fields Admin may change through PATCH /api/college-hub/colleges.
 *
 * The route used to pass the whole request body to .update(), so any column
 * (status, claimed_by, unsubscribe_token...) could be rewritten. Now only these
 * go through. Changing a photo by hand marks the college 'manual', which the
 * photo cron never touches again.
 */

const TIERS = ['free', 'silver', 'gold', 'platinum'] as const;

const PHOTO_FIELDS = [
  'hero_image_url',
  'hero_image_credit',
  'hero_image_source_url',
  'hero_image_license',
  'logo_url',
  'logo_source_url',
] as const;

const str = (v: unknown, max: number): string | null | undefined => {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export type CollegePatch = { ok: true; updates: Record<string, unknown> } | { ok: false; error: string };

export function pickCollegePatch(body: Record<string, unknown>): CollegePatch {
  const updates: Record<string, unknown> = {};

  if ('neram_tier' in body) {
    if (!TIERS.includes(body.neram_tier as (typeof TIERS)[number])) return { ok: false, error: 'Unknown tier' };
    updates.neram_tier = body.neram_tier;
  }

  let photoTouched = false;
  for (const f of PHOTO_FIELDS) {
    if (!(f in body)) continue;
    const v = str(body[f], f.endsWith('_url') ? 1000 : 200);
    if (v === undefined) return { ok: false, error: `${f} must be text or null` };
    if (v && f.endsWith('_url') && !/^(https:\/\/|\/)/.test(v)) return { ok: false, error: `${f} must be an https URL` };
    updates[f] = v;
    photoTouched = true;
  }
  if (photoTouched) updates.photo_status = 'manual';

  if ('aliases' in body) {
    const a = body.aliases;
    if (a !== null && !(Array.isArray(a) && a.every((x) => typeof x === 'string'))) {
      return { ok: false, error: 'aliases must be a list of names' };
    }
    updates.aliases = a === null ? null : [...new Set((a as string[]).map((x) => x.trim()).filter(Boolean))].slice(0, 12);
  }

  if (Object.keys(updates).length === 0) return { ok: false, error: 'Nothing to update' };
  return { ok: true, updates };
}
