import type { RenewVideoSrc } from './types';

/**
 * A `renew` for a video whose src comes from one of the embed routes.
 *
 * `fetchJson` must fetch a fresh Microsoft token on every call, which is what
 * useAuthFetch does. A token captured once and reused is how NXS-0119 began:
 * the grant renewed fine every ten minutes until the Microsoft token behind it
 * expired about ninety minutes in, and from then on every renewal was refused.
 *
 * The routes answer with `streamUrl` or `src` depending on their age. A reply
 * with neither (the recording moved to its YouTube backup mid-watch) cannot be
 * renewed in place, so it says to reload rather than failing silently.
 */
export function renewFromEmbed(
  fetchJson: (url: string) => Promise<{ streamUrl?: string | null; src?: string | null }>,
  url: string,
): RenewVideoSrc {
  return async () => {
    const data = await fetchJson(url);
    const src = data?.streamUrl || data?.src;
    if (!src) throw new Error('This recording changed while you were watching. Reload the page to continue.');
    return src;
  };
}
