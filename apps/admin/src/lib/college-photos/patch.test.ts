import { describe, expect, it } from 'vitest';
import { pickCollegePatch } from './patch';

describe('pickCollegePatch', () => {
  it('passes the tier the Colleges grid sends', () => {
    expect(pickCollegePatch({ neram_tier: 'gold' })).toEqual({ ok: true, updates: { neram_tier: 'gold' } });
  });

  it('refuses columns outside the list', () => {
    expect(pickCollegePatch({ status: 'inactive', claimed_by: 'x' })).toEqual({ ok: false, error: 'Nothing to update' });
    const r = pickCollegePatch({ neram_tier: 'free', unsubscribe_token: 'x' });
    expect(r.ok && r.updates).toEqual({ neram_tier: 'free' });
  });

  it('marks a hand-edited photo as manual', () => {
    const r = pickCollegePatch({ hero_image_url: 'https://db.neramclasses.com/x.webp', hero_image_credit: ' Staff ' });
    expect(r).toEqual({
      ok: true,
      updates: { hero_image_url: 'https://db.neramclasses.com/x.webp', hero_image_credit: 'Staff', photo_status: 'manual' },
    });
  });

  it('lets staff remove a photo with null', () => {
    const r = pickCollegePatch({ logo_url: null });
    expect(r.ok && r.updates).toEqual({ logo_url: null, photo_status: 'manual' });
  });

  it('refuses a non-https photo url and an unknown tier', () => {
    expect(pickCollegePatch({ hero_image_url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(pickCollegePatch({ neram_tier: 'diamond' }).ok).toBe(false);
  });

  it('cleans aliases', () => {
    const r = pickCollegePatch({ aliases: [' MSEC ', 'MSEC', ''] });
    expect(r.ok && r.updates).toEqual({ aliases: ['MSEC'] });
    expect(pickCollegePatch({ aliases: 'MSEC' }).ok).toBe(false);
  });
});
