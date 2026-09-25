const COOKIE_NAME = 'neram_attribution';

export interface SharedAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referralCode: string | null;
}

const EMPTY: SharedAttribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referralCode: null,
};

/**
 * The campaign touch the marketing site stored in the neram_attribution cookie
 * on .neramclasses.com (see apps/marketing/src/lib/attribution.ts), so a lead
 * who clicked an ad on neramclasses.com and applies here keeps its source.
 */
export function readSharedAttribution(): SharedAttribution {
  if (typeof document === 'undefined') return EMPTY;
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return EMPTY;
  try {
    const data = JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)));
    const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
    return {
      utmSource: str(data.utm_source),
      utmMedium: str(data.utm_medium),
      utmCampaign: str(data.utm_campaign),
      referralCode: str(data.referral_code),
    };
  } catch {
    return EMPTY;
  }
}
