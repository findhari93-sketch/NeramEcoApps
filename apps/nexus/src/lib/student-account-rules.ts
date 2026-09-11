/**
 * The rules behind creating a student's Microsoft account from Nexus.
 *
 * Pure: no Graph, no database, and no randomness it is not handed. The routes and
 * the form share these, and every rule a reviewer would ask about (what a login
 * ID looks like, what a temporary password contains, which Azure permission is
 * missing, which license a new student gets) is unit tested here.
 */

export const STUDENT_ACCOUNT_DOMAIN = 'neramclasses.com';
export const DEFAULT_USAGE_LOCATION = 'IN';
export const NEXUS_SIGN_IN_URL = 'https://nexus.neramclasses.com';

/** Entra caps the part before the @ at 64 characters. */
const MAX_USERNAME = 64;

// ── Login IDs ───────────────────────────────────────────────────────────────

function asciiWords(text: string | null | undefined): string[] {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** "dhisha" and "DHISHA" both become "Dhisha"; "McKay" keeps its inner capital. */
function capitalise(word: string): string {
  const rest = word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1);
  return word.charAt(0).toUpperCase() + rest;
}

/**
 * Tidy whatever was typed into something Entra accepts: letters, digits and . _ -
 * only, no separator at either end, none doubled. Anything from an @ on is
 * dropped, so pasting a whole address still works.
 */
export function normalizeUsername(raw: string | null | undefined): string {
  return String(raw || '')
    .split('@')[0]
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, (run) => run.charAt(0))
    .replace(/^[._-]+/, '')
    .slice(0, MAX_USERNAME)
    .replace(/[._-]+$/, '');
}

/**
 * First_Last, matching the accounts made by hand so far (Afrin_banu,
 * Dhisha_Haribabu, Anuvika_Stalin). Extra name words join with underscores too.
 */
export function suggestUsername(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return normalizeUsername([...asciiWords(firstName), ...asciiWords(lastName)].map(capitalise).join('_'));
}

export function isValidUsername(username: string | null | undefined): boolean {
  const value = String(username || '');
  return (
    value.length <= MAX_USERNAME &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(value) &&
    !/[._-]{2,}/.test(value)
  );
}

/** Dhisha_Haribabu, then Dhisha_Haribabu2, Dhisha_Haribabu3: the order a clash is resolved in. */
export function usernameWithSuffix(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = String(attempt);
  return `${base.slice(0, MAX_USERNAME - suffix.length)}${suffix}`;
}

export function upnFor(username: string, domain: string = STUDENT_ACCOUNT_DOMAIN): string {
  return `${username}@${domain}`;
}

// ── Temporary passwords ─────────────────────────────────────────────────────

/** No 0 O o 1 l I: this is read off one phone screen and typed on another. */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
/** No * _ ~ or backtick: WhatsApp turns those into formatting and swallows them. */
const SYMBOLS = '@#$%&?!+=';

export const TEMP_PASSWORD_LENGTH = 12;
export const TEMP_PASSWORD_ALPHABET = UPPER + LOWER + DIGITS + SYMBOLS;

/** An integer in [0, maxExclusive). Production passes node:crypto's randomInt. */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Twelve characters with at least one of each class, which clears Entra's
 * complexity rule, shuffled so the classes do not sit in a predictable order.
 */
export function generateTempPassword(randomInt: RandomInt): string {
  const pick = (set: string) => set.charAt(randomInt(set.length));
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(TEMP_PASSWORD_ALPHABET));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// ── Phones ──────────────────────────────────────────────────────────────────

/** A ten-digit Indian mobile from whatever was typed, or null. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  let local = digits;
  if (digits.length === 12 && digits.startsWith('91')) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) local = digits.slice(1);
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

// ── What the student receives ──────────────────────────────────────────────

export type ShareKind = 'welcome' | 'reset';

export function buildLoginMessage(input: {
  kind: ShareKind;
  firstName: string | null | undefined;
  upn: string;
  password: string;
}): string {
  const first = String(input.firstName || '').trim() || 'there';
  const credentials = [`Login ID: ${input.upn}`, `Temporary password: ${input.password}`];

  if (input.kind === 'reset') {
    return [
      `Hi ${first}, your Neram Classes password has been reset.`,
      '',
      ...credentials,
      '',
      `1. Open ${NEXUS_SIGN_IN_URL} and sign in with this login ID.`,
      '2. Choose a new password when asked.',
      '',
      'Please keep this password private.',
    ].join('\n');
  }

  return [
    `Hi ${first}, welcome to Neram Classes!`,
    '',
    'Your student account is ready.',
    ...credentials,
    '',
    `1. Open ${NEXUS_SIGN_IN_URL} and sign in with this login ID.`,
    '2. Choose a new password when asked.',
    '3. Install Microsoft Authenticator when it asks you to secure your account.',
    '4. Install Microsoft Teams and sign in with the same login ID for live classes.',
    '',
    'Please keep this password private.',
  ].join('\n');
}

/** A wa.me link that opens WhatsApp with the message typed, addressed when the number is known. */
export function whatsAppShareUrl(message: string, phone?: string | null): string {
  const local = normalizeIndianMobile(phone);
  return `https://wa.me/${local ? `91${local}` : ''}?text=${encodeURIComponent(message)}`;
}

// ── Azure permissions ───────────────────────────────────────────────────────

export type AccountAbility = 'create' | 'license' | 'group_license' | 'seats' | 'reset_password' | 'other_mails';

/**
 * The application permissions that grant each ability, least privileged first.
 * The first entry is the one the setup card asks an admin to add. A broader
 * permission an admin already granted counts too, so the card never asks for
 * something that is effectively there.
 */
export const ABILITY_ROLES: Record<AccountAbility, readonly string[]> = {
  create: ['User.Create', 'User.ReadWrite.All', 'Directory.ReadWrite.All'],
  license: ['LicenseAssignment.ReadWrite.All', 'User.ReadWrite.All', 'Directory.ReadWrite.All'],
  group_license: ['GroupMember.ReadWrite.All', 'Group.ReadWrite.All', 'Directory.ReadWrite.All'],
  seats: [
    'LicenseAssignment.Read.All',
    'LicenseAssignment.ReadWrite.All',
    'Organization.Read.All',
    'Organization.ReadWrite.All',
    'Directory.Read.All',
    'Directory.ReadWrite.All',
  ],
  reset_password: ['User-PasswordProfile.ReadWrite.All', 'User.ReadWrite.All', 'Directory.ReadWrite.All'],
  other_mails: ['User-Mail.ReadWrite.All', 'User.ReadWrite.All', 'Directory.ReadWrite.All'],
};

export interface AccountReadiness {
  abilities: Record<AccountAbility, boolean>;
  canCreate: boolean;
  canResetPassword: boolean;
  /** What creating an account still needs, by least privileged name. */
  missing: string[];
  /** Useful but not blocking: password resets, and saving the personal email. */
  optionalMissing: string[];
}

/** The `roles` claim of an app-only token: the permissions actually granted. */
export function decodeTokenRoles(token: string | null | undefined): string[] {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return [];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { roles?: unknown };
    return Array.isArray(claims.roles)
      ? claims.roles.filter((role): role is string => typeof role === 'string')
      : [];
  } catch {
    return [];
  }
}

export function readinessFromRoles(
  roles: readonly string[],
  licenseMode: 'direct' | 'group' = 'direct',
): AccountReadiness {
  const granted = new Set(roles);
  const abilities = {} as Record<AccountAbility, boolean>;
  for (const ability of Object.keys(ABILITY_ROLES) as AccountAbility[]) {
    abilities[ability] = ABILITY_ROLES[ability].some((role) => granted.has(role));
  }
  const licensing: AccountAbility = licenseMode === 'group' ? 'group_license' : 'license';
  const needed: AccountAbility[] = ['create', licensing, 'seats'];
  return {
    abilities,
    canCreate: abilities.create && abilities[licensing],
    canResetPassword: abilities.reset_password,
    missing: needed.filter((ability) => !abilities[ability]).map((ability) => ABILITY_ROLES[ability][0]),
    optionalMissing: (['reset_password', 'other_mails'] as AccountAbility[])
      .filter((ability) => !abilities[ability])
      .map((ability) => ABILITY_ROLES[ability][0]),
  };
}

// ── Licenses ────────────────────────────────────────────────────────────────

export interface LicenseState {
  skuId: string;
  /** The licensing group, when the license comes from a group rather than directly. */
  groupId: string | null;
}

export interface DetectedLicense {
  skuId: string;
  mode: 'direct' | 'group';
  groupId: string | null;
  /** How many of the sampled students hold it. */
  students: number;
}

/**
 * The license most current students hold, which is the one a new student should
 * get. A tie goes to a directly assigned license, which Nexus can grant without
 * touching group membership.
 */
export function pickMostCommonLicense(perStudent: readonly (readonly LicenseState[])[]): DetectedLicense | null {
  const tally = new Map<string, DetectedLicense>();
  for (const states of perStudent) {
    const counted = new Set<string>();
    for (const state of states) {
      if (!state?.skuId) continue;
      const key = `${state.skuId}|${state.groupId ?? ''}`;
      if (counted.has(key)) continue;
      counted.add(key);
      const entry = tally.get(key) ?? {
        skuId: state.skuId,
        mode: state.groupId ? 'group' : 'direct',
        groupId: state.groupId ?? null,
        students: 0,
      };
      entry.students += 1;
      tally.set(key, entry);
    }
  }

  let best: DetectedLicense | null = null;
  for (const entry of tally.values()) {
    if (
      !best ||
      entry.students > best.students ||
      (entry.students === best.students && entry.mode === 'direct' && best.mode === 'group')
    ) {
      best = entry;
    }
  }
  return best;
}

const SKU_NAMES: Record<string, string> = {
  STANDARDWOFFPACK_STUDENT: 'Office 365 A1 for students',
  STANDARDWOFFPACK_IW_STUDENT: 'Office 365 A1 Plus for students',
  ENTERPRISEPACKPLUS_STUDENT: 'Office 365 A3 for students',
  ENTERPRISEPREMIUM_STUDENT: 'Office 365 A5 for students',
  M365EDU_A3_STUDENT: 'Microsoft 365 A3 for students',
  M365EDU_A5_STUDENT: 'Microsoft 365 A5 for students',
  STANDARDWOFFPACK_FACULTY: 'Office 365 A1 for faculty',
};

export function skuDisplayName(partNumber: string | null | undefined): string {
  if (!partNumber) return 'Student license';
  return SKU_NAMES[partNumber] ?? partNumber.replace(/_/g, ' ');
}

export function freeSeats(sku: { enabled: number; consumed: number }): number {
  return Math.max(0, (Number(sku.enabled) || 0) - (Number(sku.consumed) || 0));
}

/** A plain reading of the license errors staff can actually act on, or null. */
export function describeLicenseFailure(raw: string | null | undefined): string | null {
  const text = String(raw || '').toLowerCase();
  if (text.includes('does not have any available licenses') || text.includes('no available licenses')) {
    return 'There are no free student licenses left. Free one up or buy more seats, then assign it in the Microsoft 365 admin center.';
  }
  if (text.includes('usage location')) {
    return 'Microsoft refused the license because the account has no usage location.';
  }
  return null;
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface StudentAccountDefaults {
  domain: string;
  usage_location: string;
  sku_id: string | null;
  sku_part_number: string | null;
  license_mode: 'direct' | 'group';
  license_group_id: string | null;
}

export const FALLBACK_ACCOUNT_DEFAULTS: StudentAccountDefaults = {
  domain: STUDENT_ACCOUNT_DOMAIN,
  usage_location: DEFAULT_USAGE_LOCATION,
  sku_id: null,
  sku_part_number: null,
  license_mode: 'direct',
  license_group_id: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Coerce whatever is in the settings JSONB into something the routes can rely on. */
export function normalizeAccountDefaults(raw: unknown): StudentAccountDefaults {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const domain =
    typeof value.domain === 'string' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value.domain)
      ? value.domain.toLowerCase()
      : STUDENT_ACCOUNT_DOMAIN;
  const usageLocation =
    typeof value.usage_location === 'string' && /^[a-z]{2}$/i.test(value.usage_location)
      ? value.usage_location.toUpperCase()
      : DEFAULT_USAGE_LOCATION;
  const groupId = isUuid(value.license_group_id) ? value.license_group_id : null;
  const mode = value.license_mode === 'group' && groupId ? 'group' : 'direct';
  return {
    domain,
    usage_location: usageLocation,
    sku_id: isUuid(value.sku_id) ? value.sku_id : null,
    sku_part_number: typeof value.sku_part_number === 'string' ? value.sku_part_number : null,
    license_mode: mode,
    license_group_id: mode === 'group' ? groupId : null,
  };
}
