/**
 * How a student who cannot get into Nexus reaches a person.
 *
 * Everything here has to work when Nexus itself does not: the offline screen is
 * served from the phone's cache with no server behind it, so the only ways out
 * are links the phone can open on its own. WhatsApp queues a message until the
 * phone has any signal, and a tel: link needs no data at all.
 *
 * Kept inside Nexus on purpose. The same office number lives in @neram/ui's
 * ConnectToOffice, but touching packages/ redeploys all four apps.
 *
 * Pure, so it is unit tested (support-contact.test.ts).
 */

/** The Neram office line. Takes calls and WhatsApp. */
export const SUPPORT_PHONE = '+919176137043';

/** How the number reads on screen. */
export const SUPPORT_PHONE_DISPLAY = '+91 91761 37043';

export const SUPPORT_TEL_LINK = `tel:${SUPPORT_PHONE}`;

/** What went wrong, as the student picks it on the help form. */
export const HELP_PROBLEMS = [
  { value: 'cant_open', label: "Can't open the app" },
  { value: 'cant_sign_in', label: "Can't sign in" },
  { value: 'page_error', label: 'A page shows an error' },
  { value: 'other', label: 'Something else' },
] as const;

export type HelpProblem = (typeof HELP_PROBLEMS)[number]['value'];

export function isHelpProblem(value: unknown): value is HelpProblem {
  return HELP_PROBLEMS.some((p) => p.value === value);
}

export function helpProblemLabel(value: HelpProblem): string {
  return HELP_PROBLEMS.find((p) => p.value === value)?.label ?? 'Something else';
}

/**
 * A phone number as a student types it, tidied into +<country><number>.
 * A bare 10 digit number is taken as Indian. Null when it cannot be a phone number.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) {
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

/** A wa.me link that opens a chat with this number, optionally with a message typed in. */
export function whatsAppLink(phone: string, text?: string): string {
  const number = phone.replace(/\D/g, '');
  return text ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : `https://wa.me/${number}`;
}

export interface DeviceSummaryInput {
  userAgent: string;
  /** True when Nexus is running as the installed app rather than a browser tab. */
  installed: boolean;
}

/** "Android 14 phone, Chrome 129, installed app". Short enough for a chat line. */
export function describeDevice({ userAgent, installed }: DeviceSummaryInput): string {
  const ua = userAgent || '';
  const parts: string[] = [];

  const android = ua.match(/Android\s([\d.]+)/);
  const ios = ua.match(/(?:iPhone|iPad).*?OS\s([\d_]+)/);
  if (android) parts.push(`Android ${android[1].split('.')[0]} ${/Mobile/.test(ua) ? 'phone' : 'tablet'}`);
  else if (ios) parts.push(`iOS ${ios[1].split('_')[0]} ${/iPad/.test(ua) ? 'tablet' : 'phone'}`);
  else if (/Windows/.test(ua)) parts.push('Windows computer');
  else if (/Mac OS X/.test(ua)) parts.push('Mac');
  else if (/Linux/.test(ua)) parts.push('Linux computer');

  const edge = ua.match(/Edg\w*\/(\d+)/);
  const samsung = ua.match(/SamsungBrowser\/(\d+)/);
  const chrome = ua.match(/(?:Chrome|CriOS)\/(\d+)/);
  const firefox = ua.match(/(?:Firefox|FxiOS)\/(\d+)/);
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (edge) parts.push(`Edge ${edge[1]}`);
  else if (samsung) parts.push(`Samsung Internet ${samsung[1]}`);
  else if (chrome) parts.push(`Chrome ${chrome[1]}`);
  else if (firefox) parts.push(`Firefox ${firefox[1]}`);
  else if (safari) parts.push(`Safari ${safari[1]}`);

  parts.push(installed ? 'installed app' : 'browser');
  return parts.join(', ');
}

/** "30 Sep, 6:56 pm" in India time, whatever zone the phone is set to. */
export function formatIndiaTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export interface WhatsAppHelpInput {
  problem: HelpProblem;
  device: string;
  at: Date;
  appVersion?: string | null;
}

/**
 * The message a stuck student sends us on WhatsApp. Everything we need to start
 * helping is already typed in, and the name line is left for them to fill.
 */
export function buildWhatsAppHelpMessage({ problem, device, at, appVersion }: WhatsAppHelpInput): string {
  const lines = [
    'Hi Neram team, I need help with the Nexus app.',
    `Problem: ${helpProblemLabel(problem)}`,
    `When: ${formatIndiaTime(at)}`,
    `Device: ${device}`,
  ];
  if (appVersion) lines.push(`App version: ${appVersion}`);
  lines.push('My name: ', '(I will attach a screenshot.)');
  return lines.join('\n');
}

export function buildWhatsAppHelpLink(input: WhatsAppHelpInput): string {
  return whatsAppLink(SUPPORT_PHONE, buildWhatsAppHelpMessage(input));
}

/**
 * Where Back and Done go from /help. Only a path inside Nexus is accepted, so a
 * crafted ?from= cannot send a student off to another site.
 */
export function safeReturnPath(from: string | null | undefined, fallback = '/login'): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return fallback;
  if (from.startsWith('/help') || from.startsWith('/offline')) return fallback;
  return from;
}
