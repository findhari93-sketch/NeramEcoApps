/**
 * Per-centre review links (review_platform_urls): where a student is sent to post
 * a review on Google, Justdial or Sulekha. Pure, unit tested.
 *
 * Each platform only accepts links on its own domain, so a typo or a pasted
 * search result can never send a student somewhere else.
 */

export type ReviewLinkPlatform = 'google' | 'justdial' | 'sulekha';
export const REVIEW_LINK_PLATFORMS: ReviewLinkPlatform[] = ['google', 'justdial', 'sulekha'];

export const PLATFORM_LABELS: Record<ReviewLinkPlatform, string> = {
  google: 'Google review link',
  justdial: 'Justdial listing',
  sulekha: 'Sulekha listing',
};

export const PLATFORM_HINTS: Record<ReviewLinkPlatform, string> = {
  google: 'Optional. Your "Ask for reviews" link from Google Business Profile (g.page/r/.../review). Without it the Place ID link is used.',
  justdial: 'The centre’s Justdial page. Students tap "Write a review" there.',
  sulekha: 'The centre’s Sulekha page. Students tap "Write a review" there.',
};

const HOSTS: Record<ReviewLinkPlatform, RegExp> = {
  google: /(^|\.)(g\.page|google\.com|goo\.gl|maps\.app\.goo\.gl)$/i,
  justdial: /(^|\.)justdial\.com$/i,
  sulekha: /(^|\.)sulekha\.com$/i,
};

/** A clean https link on the platform's own domain, null to clear, or an error. */
export function validateReviewLink(platform: ReviewLinkPlatform, raw: unknown): { url: string | null } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return { url: null };
  if (typeof raw !== 'string') return { error: 'Paste a link.' };
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: 'That is not a full link. It should start with https://' };
  }
  if (u.protocol !== 'https:') return { error: 'Use the https:// link.' };
  if (!HOSTS[platform].test(u.hostname)) {
    return { error: `This should be a ${platform === 'google' ? 'Google' : platform === 'justdial' ? 'Justdial' : 'Sulekha'} link.` };
  }
  return { url: u.toString().slice(0, 600) };
}
