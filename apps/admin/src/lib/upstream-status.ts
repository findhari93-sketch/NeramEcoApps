/**
 * The status an admin API route answers with when a service it calls
 * (Microsoft Graph, Google, Meta, Gemini, Resend) fails.
 *
 * Never 502 or 504: Cloudflare sits in front of admin.neramclasses.com and
 * swaps an origin 502 or 504 for its own "Bad gateway" HTML page, so the JSON
 * error never reaches the screen and the UI shows a generic "could not reach"
 * message instead of what actually went wrong.
 */
export const UPSTREAM_FAILED = 424;

/** Pass a service's own error status through, except the ones Cloudflare swallows. */
export function upstreamStatus(status: number | undefined): number {
  if (!status || status < 400 || status === 502 || status === 504) return UPSTREAM_FAILED;
  return status;
}
