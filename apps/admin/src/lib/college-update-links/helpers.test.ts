import { describe, it, expect } from 'vitest';
import {
  buildMessage,
  cleanSections,
  extendedExpiry,
  formatIndianMobile,
  formatLinkDate,
  linkStatus,
  normaliseIndianMobile,
  phoneForCall,
  sectionsInWords,
  validateCreateLink,
  whatsappUrl,
} from './helpers';
import { hashToken, newToken, updateLinkUrl } from './tokens';

const COLLEGE = '0b6f9a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('tokens', () => {
  it('makes a 43 character base64url token with no padding', () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(t);
  });

  it('hashes with sha256 hex (matches marketing)', () => {
    // sha256("abc")
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken(newToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds the marketing URL', () => {
    expect(updateLinkUrl('https://neramclasses.com/', 'tok')).toBe('https://neramclasses.com/college-update/tok');
  });
});

describe('normaliseIndianMobile', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['+91 98765 43210', '919876543210'],
    ['+91-98765-43210', '919876543210'],
    ['098765 43210', '919876543210'],
    ['0091 9876543210', '919876543210'],
    ['(+91) 6123456789', '916123456789'],
  ])('%s -> %s', (input, out) => {
    expect(normaliseIndianMobile(input)).toBe(out);
  });

  it.each(['', '12345', '5876543210', '98765432101', '+1 415 555 0100', '044 2345 6789'])('rejects %s', (input) => {
    expect(normaliseIndianMobile(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normaliseIndianMobile(null)).toBeNull();
    expect(normaliseIndianMobile(undefined)).toBeNull();
  });

  it('formats for display', () => {
    expect(formatIndianMobile('919876543210')).toBe('+91 98765 43210');
    expect(formatIndianMobile(null)).toBe('');
  });
});

describe('sectionsInWords', () => {
  it('lists the sections in plain words', () => {
    expect(sectionsInWords(['profile', 'fees', 'admissions', 'photos'])).toBe('fees, admission dates, contacts and photos');
    expect(sectionsInWords(['fees'])).toBe('fees');
    expect(sectionsInWords(['photos', 'location'])).toBe('map location and photos');
  });
});

describe('buildMessage', () => {
  const base = {
    collegeName: 'Papni School of Architecture',
    url: 'https://neramclasses.com/college-update/abc',
    expiresAt: '2026-10-15T10:00:00Z',
    sections: ['profile', 'fees', 'admissions', 'photos'],
  };

  it('matches the agreed wording', () => {
    expect(buildMessage({ ...base, recipientName: 'Dr Kumar' })).toBe(
      "Hello Dr Kumar, this is Neram Classes. Please check Papni School of Architecture's details on our website " +
        '(fees, admission dates, contacts and photos) and correct anything that is out of date. It takes about 5 minutes ' +
        'and needs no login: https://neramclasses.com/college-update/abc . Our team reviews every change before it goes live. ' +
        'The link works until 15 Oct 2026.',
    );
  });

  it('says Hello, without a name and keeps a space before the dot after the URL', () => {
    const m = buildMessage({ ...base, recipientName: '  ' });
    expect(m.startsWith('Hello, this is Neram Classes.')).toBe(true);
    expect(m).toContain('/college-update/abc . ');
  });

  it('has no dashes', () => {
    const m = buildMessage({ ...base, recipientName: 'A' });
    expect(m).not.toMatch(/—|--/);
  });
});

describe('formatLinkDate', () => {
  it('uses India time', () => {
    // 20:00 UTC on 14 Oct is 01:30 on 15 Oct in India.
    expect(formatLinkDate('2026-10-14T20:00:00Z')).toBe('15 Oct 2026');
    expect(formatLinkDate('2026-09-01T00:00:00Z')).toBe('1 Sep 2026');
  });
});

describe('whatsappUrl', () => {
  it('encodes the message, with or without a phone', () => {
    expect(whatsappUrl('919876543210', 'Hi & bye')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
    expect(whatsappUrl(null, 'Hi')).toBe('https://wa.me/?text=Hi');
  });
});

describe('linkStatus', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  const link = { revoked_at: null, expires_at: '2026-10-29T00:00:00Z', submitted_at: null, first_opened_at: null, open_count: 0 };

  it('not opened, opened, submitted', () => {
    expect(linkStatus(link, now)).toBe('not_opened');
    expect(linkStatus({ ...link, first_opened_at: '2026-10-15T00:00:00Z', open_count: 1 }, now)).toBe('opened');
    expect(linkStatus({ ...link, submitted_at: '2026-10-15T00:00:00Z' }, now)).toBe('submitted');
  });

  it('expired and cancelled', () => {
    expect(linkStatus({ ...link, expires_at: '2026-10-14T00:00:00Z' }, now)).toBe('expired');
    expect(linkStatus({ ...link, revoked_at: '2026-10-14T00:00:00Z', submitted_at: '2026-10-13T00:00:00Z' }, now)).toBe('cancelled');
  });

  it('a submitted link stays Submitted after it runs out', () => {
    expect(linkStatus({ ...link, expires_at: '2026-10-14T00:00:00Z', submitted_at: '2026-10-13T00:00:00Z' }, now)).toBe('submitted');
  });
});

describe('extendedExpiry', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  it('adds 14 days to a future expiry', () => {
    expect(extendedExpiry('2026-10-20T00:00:00.000Z', now)).toBe('2026-11-03T00:00:00.000Z');
  });
  it('adds 14 days to today when already expired', () => {
    expect(extendedExpiry('2026-10-01T00:00:00.000Z', now)).toBe('2026-10-29T00:00:00.000Z');
  });
});

describe('cleanSections', () => {
  it('keeps known sections in canonical order', () => {
    expect(cleanSections(['photos', 'fees', 'nope', 'fees'])).toEqual(['fees', 'photos']);
    expect(cleanSections('fees')).toEqual([]);
  });
});

describe('validateCreateLink', () => {
  it('fills defaults', () => {
    const r = validateCreateLink({ college_id: COLLEGE });
    expect(r).toEqual({
      ok: true,
      value: {
        college_id: COLLEGE,
        recipient_name: null,
        recipient_phone: null,
        sections: ['profile', 'fees', 'admissions', 'location', 'photos'],
        expires_in_days: 14,
        note: null,
        replace_link_id: null,
      },
    });
  });

  it('normalises the phone and trims text', () => {
    const r = validateCreateLink({
      college_id: COLLEGE,
      recipient_name: '  Dr Kumar ',
      recipient_phone: '98765 43210',
      sections: ['facilities'],
      expires_in_days: 30,
      note: ' Fees for 2027 ',
    });
    expect(r.ok && r.value).toMatchObject({
      recipient_name: 'Dr Kumar',
      recipient_phone: '919876543210',
      sections: ['facilities'],
      expires_in_days: 30,
      note: 'Fees for 2027',
    });
  });

  it.each([
    [null, 'Send a JSON body.'],
    [{ college_id: 'x' }, 'Choose a college.'],
    [{ college_id: COLLEGE, recipient_phone: '12345' }, 'Enter a 10 digit Indian mobile number, or leave it empty.'],
    [{ college_id: COLLEGE, sections: [] }, 'Pick at least one section.'],
    [{ college_id: COLLEGE, sections: ['fees', 'secret'] }, 'Unknown section in the list.'],
    [{ college_id: COLLEGE, expires_in_days: 10 }, 'The link can work for 7, 14 or 30 days.'],
    [{ college_id: COLLEGE, replace_link_id: 'abc' }, 'Unknown link to replace.'],
  ])('rejects %j', (body, error) => {
    expect(validateCreateLink(body as Record<string, unknown> | null)).toEqual({ ok: false, error });
  });
});

describe('phoneForCall', () => {
  it('makes a tel link for Indian mobiles and other numbers', () => {
    expect(phoneForCall('919876543210')).toEqual({ href: 'tel:+919876543210', display: '+91 98765 43210' });
    expect(phoneForCall('98765 43210')).toEqual({ href: 'tel:+919876543210', display: '+91 98765 43210' });
    expect(phoneForCall('044 2345 6789')).toEqual({ href: 'tel:04423456789', display: '044 2345 6789' });
    expect(phoneForCall('  ')).toBeNull();
    expect(phoneForCall(null)).toBeNull();
  });
});
