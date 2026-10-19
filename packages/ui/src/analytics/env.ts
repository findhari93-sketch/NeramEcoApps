/**
 * Google tag configuration, shared by the marketing site and the app.
 *
 * Every value is read inside a function: Next.js inlines `process.env.NEXT_PUBLIC_*`
 * at build time wherever it is written literally, and tests can stub them.
 * The IDs and labels are set on Vercel Production only.
 */

/** Hostnames where the Google tag may load and conversions may fire. */
export const PROD_HOSTS = ['neramclasses.com', 'www.neramclasses.com', 'app.neramclasses.com'] as const;

export function gadsId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? '';
}

/** "Sign-up (OTP verified)" conversion label. */
export function signupLabel(): string {
  return process.env.NEXT_PUBLIC_GADS_LABEL_SIGNUP ?? '';
}

/** "Application Submitted" conversion label. */
export function applicationLabel(): string {
  return process.env.NEXT_PUBLIC_GADS_LABEL_APPLICATION ?? '';
}

/** Phone-call (tel: link click) conversion label. */
export function callLabel(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_CALL_LABEL ?? '';
}

export function ga4Id(): string {
  return process.env.NEXT_PUBLIC_GA4_ID ?? '';
}

/**
 * Build gate. Vercel sets NEXT_PUBLIC_VERCEL_ENV when system variables are
 * exposed; a build that says it is a preview or development build never tracks.
 * When it is not set we rely on the env vars being Production-only plus the
 * hostname check, so the tag can never vanish from production by accident.
 */
export function isTrackableBuild(): boolean {
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV;
  return !env || env === 'production';
}

export function isProdHost(hostname: string): boolean {
  return (PROD_HOSTS as readonly string[]).includes(hostname);
}

/** Runtime gate: browser, production build, tag configured, real production hostname. */
export function canTrack(): boolean {
  if (typeof window === 'undefined') return false;
  return isTrackableBuild() && !!gadsId() && isProdHost(window.location.hostname);
}
