/**
 * Where the public marketing site lives, as seen from Admin.
 *
 * Admin and Marketing are separate Vercel projects on sibling hosts, so the origin
 * is derived from the one Admin is being served from: admin.neramclasses.com pairs
 * with neramclasses.com, staging-admin. with staging., and in development ports
 * 3013 and 3010. NEXT_PUBLIC_MARKETING_URL wins when it is set.
 *
 * This deliberately does not import the Nexus copy: the two strip different
 * subdomain prefixes ('admin.' here, 'nexus.' there) and share no code path. Pure,
 * so it is unit tested, which matters because the URL it builds is pasted into
 * WhatsApp by a member of staff and a wrong origin means a student is sent a link
 * that opens nothing.
 */

export const PROD_MARKETING_ORIGIN = 'https://neramclasses.com';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_MARKETING_PORT = '3010';

export function marketingOriginFor(
  adminOrigin: string | null | undefined,
  configured?: string | null,
): string {
  const explicit = (configured || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  let url: URL;
  try {
    url = new URL(adminOrigin || '');
  } catch {
    return PROD_MARKETING_ORIGIN;
  }

  const host = url.hostname;
  if (LOCAL_HOSTS.has(host)) return `${url.protocol}//${host}:${LOCAL_MARKETING_PORT}`;
  if (host.startsWith('staging-admin.')) {
    return `${url.protocol}//staging.${host.slice('staging-admin.'.length)}`;
  }
  if (host.startsWith('admin.')) return `${url.protocol}//${host.slice('admin.'.length)}`;
  // A preview deployment has no marketing twin, and production is the safe landing.
  return PROD_MARKETING_ORIGIN;
}

/**
 * The page where a student fills in their own application details.
 * Kept short because it is read off a phone screen and typed by hand when the tap
 * does not work: neramclasses.com/s/<token>.
 */
export function studentDetailUrl(
  token: string,
  options: { adminOrigin?: string | null; configured?: string | null } = {},
): string {
  const base = marketingOriginFor(options.adminOrigin, options.configured);
  return `${base}/s/${encodeURIComponent(token)}`;
}

/**
 * The message staff paste into WhatsApp.
 *
 * Says who it is from and why before it says what to do, because it arrives from an
 * unknown number and otherwise reads like every fee-scam forward a parent receives.
 * No em dashes: this is user-visible copy.
 */
export function whatsappMessage(firstName: string | null | undefined, url: string): string {
  const name = (firstName || '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return [
    `${greeting} this is Neram Classes.`,
    '',
    'We are missing some of your application details (class, exam year and where you live).',
    'Please fill them in here, it takes about two minutes and needs no password:',
    url,
    '',
    'The link works for 14 days. Reply here if it does not open.',
  ].join('\n');
}

/**
 * The review link a past student opens: neramclasses.com/r/<token>.
 * Short for the same reason as the detail link: it is read off a phone screen.
 */
export function reviewRequestUrl(
  token: string,
  options: { adminOrigin?: string | null; configured?: string | null } = {},
): string {
  const base = marketingOriginFor(options.adminOrigin, options.configured);
  return `${base}/r/${encodeURIComponent(token)}`;
}

/**
 * The message staff paste into WhatsApp to ask a past student for a review.
 *
 * Congratulates first and says who it is from, so it does not read like a forward.
 * Mentions speaking, because "write a review" is what makes people put it off.
 * No em dashes: this is user-visible copy.
 */
export function reviewRequestMessage(
  firstName: string | null | undefined,
  url: string,
  college?: string | null,
): string {
  const name = (firstName || '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const cheer = college?.trim() ? `Congratulations on joining ${college.trim()}!` : 'Congratulations on your results!';
  return [
    `${greeting} this is Neram Classes. ${cheer}`,
    '',
    'Could you share a few words about your time with Neram? It helps the next student choose.',
    'You can just tap the mic and speak. It takes about two minutes and needs no password:',
    url,
    '',
    'Thank you!',
  ].join('\n');
}

const PLATFORM_NAMES = { google: 'Google', justdial: 'Justdial', sulekha: 'Sulekha' } as const;

/**
 * The one follow-up to a student who sent a review but has not posted it on
 * Google (or their directory). The link reopens their thank-you screen, where
 * one tap copies the review and opens the right page. No em dashes.
 */
export function reviewReminderMessage(
  firstName: string | null | undefined,
  url: string,
  platform: 'google' | 'justdial' | 'sulekha',
): string {
  const name = (firstName || '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const where = PLATFORM_NAMES[platform];
  return [
    `${greeting} thank you again for your review of Neram Classes!`,
    '',
    `One small favour: could you post the same review on ${where}? Most parents check ${where} before choosing.`,
    'Open this link and tap the button. Your review is copied for you, so it takes about 20 seconds:',
    url,
  ].join('\n');
}
