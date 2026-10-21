/**
 * Which device the student is on, so each install step shows one button that
 * goes straight to the right store instead of "search for it".
 */

export type Device = 'android' | 'ios' | 'windows' | 'mac' | 'other';

export function detectDevice(userAgent: string | null | undefined, maxTouchPoints = 0): Device {
  const ua = String(userAgent || '');
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh|mac os x/i.test(ua)) return 'mac';
  return 'other';
}

export function isPhone(device: Device): boolean {
  return device === 'android' || device === 'ios';
}

/**
 * Opened from a link inside WhatsApp, Instagram or Facebook. Google refuses to
 * sign in inside these, so the page offers to open in the real browser.
 */
export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || '');
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat/i.test(ua) || (/Android/i.test(ua) && /; wv\)/i.test(ua));
}

/** Opens this same page in Chrome on Android, out of the WhatsApp browser. */
export function chromeIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`;
}

export type AppKey = 'authenticator' | 'teams';

export interface StoreLink {
  href: string;
  label: string;
  store: 'Play Store' | 'App Store' | 'Microsoft';
}

const LINKS: Record<AppKey, Partial<Record<Device, StoreLink>>> = {
  authenticator: {
    android: { href: 'https://play.google.com/store/apps/details?id=com.azure.authenticator', label: 'Get it on Play Store', store: 'Play Store' },
    ios: { href: 'https://apps.apple.com/app/microsoft-authenticator/id983156458', label: 'Get it on the App Store', store: 'App Store' },
  },
  teams: {
    android: { href: 'https://play.google.com/store/apps/details?id=com.microsoft.teams', label: 'Get it on Play Store', store: 'Play Store' },
    ios: { href: 'https://apps.apple.com/app/microsoft-teams/id1113153706', label: 'Get it on the App Store', store: 'App Store' },
    windows: { href: 'https://www.microsoft.com/en-in/microsoft-teams/download-app', label: 'Download for Windows', store: 'Microsoft' },
    mac: { href: 'https://www.microsoft.com/en-in/microsoft-teams/download-app', label: 'Download for Mac', store: 'Microsoft' },
  },
};

/** The one button for this device, or null when the app is phone-only and this is a laptop. */
export function storeLinkFor(app: AppKey, device: Device): StoreLink | null {
  return LINKS[app][device] ?? null;
}

/** Every other place the app can be installed, for "also on your laptop or another phone". */
export function otherStoreLinks(app: AppKey, device: Device): (StoreLink & { device: Device })[] {
  const seen = new Set<string>();
  return (Object.entries(LINKS[app]) as [Device, StoreLink][])
    .filter(([d]) => d !== device)
    .filter(([, link]) => (seen.has(link.href + link.label) ? false : (seen.add(link.href + link.label), true)))
    .map(([d, link]) => ({ ...link, device: d }));
}

export const DEVICE_NAMES: Record<Device, string> = {
  android: 'Android phone',
  ios: 'iPhone',
  windows: 'Windows laptop',
  mac: 'Mac',
  other: 'this device',
};
