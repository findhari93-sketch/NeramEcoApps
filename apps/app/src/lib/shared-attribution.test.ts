import { describe, it, expect, beforeEach } from 'vitest';
import { readSharedAttribution } from './shared-attribution';

function setCookie(value: string) {
  document.cookie = `neram_attribution=${value}; Path=/`;
}

beforeEach(() => {
  document.cookie = 'neram_attribution=; Max-Age=0; Path=/';
});

/**
 * Marketing writes the campaign touch to a neram_attribution cookie on
 * .neramclasses.com (apps/marketing/src/lib/attribution.ts). The app's apply
 * form reads it back when its own URL carries no campaign params.
 */
describe('readSharedAttribution', () => {
  it('reads the campaign and referral written by the marketing site', () => {
    setCookie(
      encodeURIComponent(
        JSON.stringify({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'tn_authority', referral_code: 'STU1' })
      )
    );
    expect(readSharedAttribution()).toEqual({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'tn_authority',
      referralCode: 'STU1',
    });
  });

  it('returns nulls when there is no cookie', () => {
    expect(readSharedAttribution()).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referralCode: null,
    });
  });

  it('returns nulls for a corrupt cookie instead of throwing', () => {
    setCookie('%7Bnot-json');
    expect(readSharedAttribution().utmSource).toBeNull();
  });
});
