/**
 * Which Answer Pad pages run inside a Microsoft Teams frame.
 *
 * Those pages sign in with the Teams SSO token, and the Nexus auth provider
 * must never reach for MSAL on them: MSAL answers an expired session with a
 * full-page redirect to the Microsoft sign-in page, and sign-in pages refuse to
 * render inside a frame, so the side panel would go blank mid-class.
 *
 * The browser pages (/pad and /pad/r/<code>) are top level and keep the normal
 * Nexus sign-in, which is exactly what a student opening the room-code link
 * needs.
 */

const TEAMS_PAGES = ['/pad/teams', '/pad/stage'];

export function isTeamsPadPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return TEAMS_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
