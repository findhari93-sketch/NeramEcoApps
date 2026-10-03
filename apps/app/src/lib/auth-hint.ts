/**
 * A per-device hint that someone was signed in on the last visit. Public tool
 * pages render the signed-out view on the server (crawlers must see it), so a
 * returning student would see the public header and demo flash before Firebase
 * restores their session. An inline script copies this hint onto
 * <html data-auth-hint="1"> before first paint, and CSS shows a skeleton
 * instead of the public-only parts (see globals.css).
 *
 * Only a hint: a stale one costs a skeleton for a moment and is then cleared.
 * Never read it during render (hydration mismatch); read it in effects only.
 */
export const AUTH_HINT_KEY = 'neram_auth_hint';

export function writeAuthHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(AUTH_HINT_KEY, '1');
    else localStorage.removeItem(AUTH_HINT_KEY);
    if (signedIn) document.documentElement.setAttribute('data-auth-hint', '1');
    else document.documentElement.removeAttribute('data-auth-hint');
  } catch {
    // Storage blocked (private mode): the page simply shows the public view first.
  }
}

/** Inline script for the root <head>. Runs before React, so no hydration effect. */
export const AUTH_HINT_SCRIPT = `try{if(localStorage.getItem('${AUTH_HINT_KEY}')==='1'){document.documentElement.setAttribute('data-auth-hint','1')}}catch(e){}`;
