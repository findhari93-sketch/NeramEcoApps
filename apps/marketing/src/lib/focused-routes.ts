/**
 * Routes that render inside the application shell instead of the marketing
 * chrome: the apply flow, the public pay page (and its phone-OTP link), and
 * the direct-enrolment wizard. Any locale prefix, an optional trailing slash,
 * and any query string are accepted. `/apply-now` is a marketing page.
 */
const FOCUSED = /^\/(?:(?:en|ta|hi|kn|ml)\/)?(?:apply|pay|enroll)(?:\/|\?|$)/;

export function isFocusedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FOCUSED.test(pathname);
}
