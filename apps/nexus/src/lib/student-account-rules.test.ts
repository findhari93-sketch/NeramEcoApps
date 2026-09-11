import { randomInt } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  FALLBACK_ACCOUNT_DEFAULTS,
  TEMP_PASSWORD_ALPHABET,
  buildLoginMessage,
  decodeTokenRoles,
  describeLicenseFailure,
  freeSeats,
  generateTempPassword,
  isValidUsername,
  normalizeAccountDefaults,
  normalizeIndianMobile,
  normalizeUsername,
  pickMostCommonLicense,
  readinessFromRoles,
  skuDisplayName,
  suggestUsername,
  upnFor,
  usernameWithSuffix,
  whatsAppShareUrl,
} from './student-account-rules';

const SKU_A1 = '314c4481-f395-4525-be8b-2ec4bb1e9d91';
const SKU_OTHER = '6fd2c87f-b296-42f0-b197-1e91e994b900';
const GROUP = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';

function tokenWith(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

describe('suggestUsername', () => {
  it('matches the First_Last accounts made by hand', () => {
    expect(suggestUsername('Dhisha', 'Haribabu')).toBe('Dhisha_Haribabu');
    expect(suggestUsername('afrin', 'banu')).toBe('Afrin_Banu');
    expect(suggestUsername('ANUVIKA', 'STALIN')).toBe('Anuvika_Stalin');
  });

  it('joins extra name words and drops accents and punctuation', () => {
    expect(suggestUsername('Mohamed Aslam', 'K')).toBe('Mohamed_Aslam_K');
    expect(suggestUsername('Sélvi', "O'Neil")).toBe('Selvi_O_Neil');
  });

  it('works with a first name alone and gives nothing for no letters', () => {
    expect(suggestUsername('Nethrra', '')).toBe('Nethrra');
    expect(suggestUsername('  ', '!!')).toBe('');
  });
});

describe('normalizeUsername and isValidUsername', () => {
  it('tidies typed input into an allowed login ID', () => {
    expect(normalizeUsername(' dhisha  haribabu ')).toBe('dhisha_haribabu');
    expect(normalizeUsername('a__b..c')).toBe('a_b.c');
    expect(normalizeUsername('_.x-')).toBe('x');
    expect(normalizeUsername('Dhisha_Haribabu@neramclasses.com')).toBe('Dhisha_Haribabu');
  });

  it('accepts only what Entra accepts', () => {
    expect(isValidUsername('Dhisha_Haribabu')).toBe(true);
    expect(isValidUsername('a')).toBe(true);
    expect(isValidUsername('')).toBe(false);
    expect(isValidUsername('_x')).toBe(false);
    expect(isValidUsername('x_')).toBe(false);
    expect(isValidUsername('a..b')).toBe(false);
    expect(isValidUsername('a b')).toBe(false);
    expect(isValidUsername('a'.repeat(65))).toBe(false);
  });

  it('adds a number on a clash without passing 64 characters', () => {
    expect(usernameWithSuffix('Dhisha_Haribabu', 1)).toBe('Dhisha_Haribabu');
    expect(usernameWithSuffix('Dhisha_Haribabu', 2)).toBe('Dhisha_Haribabu2');
    expect(usernameWithSuffix('a'.repeat(64), 3)).toHaveLength(64);
    expect(upnFor('Dhisha_Haribabu')).toBe('Dhisha_Haribabu@neramclasses.com');
  });
});

describe('generateTempPassword', () => {
  it('always has twelve characters of every class and no look-alikes', () => {
    for (let i = 0; i < 300; i++) {
      const password = generateTempPassword((max) => randomInt(max));
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
      expect(password).toMatch(/[@#$%&?!+=]/);
      // Look-alikes, and the characters WhatsApp turns into formatting.
      expect(password).not.toMatch(/[0O1lIo*_~`]/);
      for (const char of password) expect(TEMP_PASSWORD_ALPHABET).toContain(char);
    }
  });

  it('uses only the randomness it is given', () => {
    const always = (value: number) => (max: number) => Math.min(value, max - 1);
    expect(generateTempPassword(always(0))).toBe(generateTempPassword(always(0)));
    expect(generateTempPassword(always(0))).not.toBe(generateTempPassword(always(5)));
  });
});

describe('normalizeIndianMobile', () => {
  it('reads the ways a number gets typed', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('+91 98765-43210')).toBe('9876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('9876543210');
  });

  it('refuses what is not an Indian mobile', () => {
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull();
    expect(normalizeIndianMobile(null)).toBeNull();
  });
});

describe('buildLoginMessage and whatsAppShareUrl', () => {
  const upn = 'Dhisha_Haribabu@neramclasses.com';

  it('writes the welcome message the student follows', () => {
    const message = buildLoginMessage({ kind: 'welcome', firstName: 'Dhisha', upn, password: 'Ab3#kP9m$Qr2' });
    expect(message.split('\n')[0]).toBe('Hi Dhisha, welcome to Neram Classes!');
    expect(message).toContain(`Login ID: ${upn}`);
    expect(message).toContain('Temporary password: Ab3#kP9m$Qr2');
    expect(message).toContain('1. Open https://nexus.neramclasses.com and sign in with this login ID.');
    expect(message).toContain('4. Install Microsoft Teams and sign in with the same login ID for live classes.');
    expect(message).not.toMatch(/—|--/);
  });

  it('writes a shorter message after a reset, and copes with no first name', () => {
    const message = buildLoginMessage({ kind: 'reset', firstName: '', upn, password: 'x' });
    expect(message.split('\n')[0]).toBe('Hi there, your Neram Classes password has been reset.');
    expect(message).not.toContain('Authenticator');
  });

  it('addresses WhatsApp when the number is known', () => {
    const message = 'Hi & welcome';
    const addressed = whatsAppShareUrl(message, '98765 43210');
    expect(addressed.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(decodeURIComponent(addressed.split('text=')[1])).toBe(message);
    expect(whatsAppShareUrl(message, null).startsWith('https://wa.me/?text=')).toBe(true);
  });
});

describe('Azure readiness', () => {
  it('reads the permissions out of an app-only token', () => {
    expect(decodeTokenRoles(tokenWith({ roles: ['User.Create', 'User.Read.All'] }))).toEqual([
      'User.Create',
      'User.Read.All',
    ]);
    expect(decodeTokenRoles(tokenWith({ aud: 'x' }))).toEqual([]);
    expect(decodeTokenRoles('not-a-token')).toEqual([]);
    expect(decodeTokenRoles(null)).toEqual([]);
  });

  it('names the least privileged permissions that are missing', () => {
    const none = readinessFromRoles([]);
    expect(none.canCreate).toBe(false);
    expect(none.missing).toEqual(['User.Create', 'LicenseAssignment.ReadWrite.All', 'LicenseAssignment.Read.All']);
    expect(none.optionalMissing).toEqual(['User-PasswordProfile.ReadWrite.All', 'User-Mail.ReadWrite.All']);
  });

  it('accepts a broader permission an admin already granted', () => {
    const broad = readinessFromRoles(['User.ReadWrite.All']);
    expect(broad.canCreate).toBe(true);
    expect(broad.missing).toEqual(['LicenseAssignment.Read.All']);
  });

  it('is ready with the least privileged set, and asks for group rights only for group licensing', () => {
    const exact = ['User.Create', 'LicenseAssignment.ReadWrite.All', 'LicenseAssignment.Read.All'];
    expect(readinessFromRoles(exact).canCreate).toBe(true);
    expect(readinessFromRoles(exact).missing).toEqual([]);
    const grouped = readinessFromRoles(exact, 'group');
    expect(grouped.canCreate).toBe(false);
    expect(grouped.missing).toEqual(['GroupMember.ReadWrite.All']);
  });
});

describe('license detection', () => {
  it('picks the license most students hold, keeping the group it came from', () => {
    const detected = pickMostCommonLicense([
      [{ skuId: SKU_A1, groupId: GROUP }, { skuId: SKU_OTHER, groupId: null }],
      [{ skuId: SKU_A1, groupId: GROUP }],
      [{ skuId: SKU_A1, groupId: GROUP }],
    ]);
    expect(detected).toEqual({ skuId: SKU_A1, mode: 'group', groupId: GROUP, students: 3 });
  });

  it('prefers a direct license on a tie, and counts a student once', () => {
    const detected = pickMostCommonLicense([
      [{ skuId: SKU_A1, groupId: GROUP }, { skuId: SKU_A1, groupId: GROUP }],
      [{ skuId: SKU_OTHER, groupId: null }],
    ]);
    expect(detected).toEqual({ skuId: SKU_OTHER, mode: 'direct', groupId: null, students: 1 });
    expect(pickMostCommonLicense([])).toBeNull();
  });

  it('names licenses and seats in plain words', () => {
    expect(skuDisplayName('STANDARDWOFFPACK_STUDENT')).toBe('Office 365 A1 for students');
    expect(skuDisplayName('SOME_NEW_SKU')).toBe('SOME NEW SKU');
    expect(skuDisplayName(null)).toBe('Student license');
    expect(freeSeats({ enabled: 500, consumed: 88 })).toBe(412);
    expect(freeSeats({ enabled: 5, consumed: 9 })).toBe(0);
    expect(describeLicenseFailure('Subscription does not have any available licenses.')).toMatch(/no free student licenses/);
    expect(describeLicenseFailure('something else')).toBeNull();
  });
});

describe('normalizeAccountDefaults', () => {
  it('falls back on anything missing or malformed', () => {
    expect(normalizeAccountDefaults(null)).toEqual(FALLBACK_ACCOUNT_DEFAULTS);
    expect(normalizeAccountDefaults({ domain: 'not a domain', usage_location: 'India', sku_id: 'abc' })).toEqual(
      FALLBACK_ACCOUNT_DEFAULTS,
    );
  });

  it('keeps a valid saved license, and drops group mode without a group', () => {
    expect(
      normalizeAccountDefaults({
        domain: 'NeramClasses.com',
        usage_location: 'in',
        sku_id: SKU_A1,
        sku_part_number: 'STANDARDWOFFPACK_STUDENT',
        license_mode: 'group',
        license_group_id: GROUP,
      }),
    ).toEqual({
      domain: 'neramclasses.com',
      usage_location: 'IN',
      sku_id: SKU_A1,
      sku_part_number: 'STANDARDWOFFPACK_STUDENT',
      license_mode: 'group',
      license_group_id: GROUP,
    });
    expect(normalizeAccountDefaults({ sku_id: SKU_A1, license_mode: 'group' }).license_mode).toBe('direct');
  });
});
