/**
 * The matching pages on neramclasses.com. App pages answer the tool question
 * ("which test city is nearest"); marketing pages carry the coaching and
 * college detail, so each app page links across instead of repeating it.
 */
import { MARKETING_URL } from '@/lib/seo/constants';

export const marketing = {
  coachingCity: (citySlug: string) => `${MARKETING_URL}/coaching/nata-coaching/nata-coaching-centers-in-${citySlug}`,
  coachingState: (stateSlug: string) => `${MARKETING_URL}/coaching/nata-coaching-in-${stateSlug}`,
  collegesState: (stateSlug: string) => `${MARKETING_URL}/colleges/${stateSlug}`,
  collegesCity: (cityPageSlug: string) => `${MARKETING_URL}/colleges/city/${cityPageSlug}`,
  college: (stateSlug: string, slug: string) => `${MARKETING_URL}/colleges/${stateSlug}/${slug}`,
  examCentresInfo: () => `${MARKETING_URL}/nata-2026/exam-centers`,
  allColleges: () => `${MARKETING_URL}/colleges`,
  tnea: () => `${MARKETING_URL}/colleges/tnea`,
  josaa: () => `${MARKETING_URL}/colleges/josaa`,
};
