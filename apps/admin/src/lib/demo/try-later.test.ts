import { describe, it, expect } from 'vitest';
import {
  buildLaterEmail,
  isParkedLater,
  laterContactAt,
  laterDateError,
  laterDateFor,
  laterEmailRecipient,
  laterFamilyMessage,
} from './try-later';

// 23 Oct 2026, 3 pm IST.
const NOW = new Date('2026-10-23T09:30:00Z');

describe('laterDateFor', () => {
  it('adds calendar months in IST', () => {
    expect(laterDateFor('1m', NOW)).toBe('2026-11-23');
    expect(laterDateFor('3m', NOW)).toBe('2027-01-23');
  });

  it('clamps to the last day of a short month', () => {
    expect(laterDateFor('1m', new Date('2027-01-31T06:00:00Z'))).toBe('2027-02-28');
  });

  it('uses the IST date, not the UTC one, late at night', () => {
    // 22 Oct 23:00 UTC is already 23 Oct in India.
    expect(laterDateFor('1m', new Date('2026-10-22T23:00:00Z'))).toBe('2026-11-23');
  });

  it('near the exam is the coming 1 December', () => {
    expect(laterDateFor('exam', NOW)).toBe('2026-12-01');
    expect(laterDateFor('exam', new Date('2026-12-01T06:00:00Z'))).toBe('2027-12-01');
    expect(laterDateFor('exam', new Date('2027-02-10T06:00:00Z'))).toBe('2027-12-01');
  });

  it('leaves a custom date to staff', () => {
    expect(laterDateFor('custom', NOW)).toBeNull();
  });
});

describe('laterDateError', () => {
  it('needs a date after today and within a year', () => {
    expect(laterDateError('', NOW)).toMatch(/Pick the date/);
    expect(laterDateError('2026-10-23', NOW)).toMatch(/after today/);
    expect(laterDateError('2026-10-24', NOW)).toBeNull();
    expect(laterDateError('2027-10-23', NOW)).toBeNull();
    expect(laterDateError('2027-10-24', NOW)).toMatch(/within a year/);
  });
});

describe('laterContactAt', () => {
  it('is 10 am IST on the day', () => {
    expect(laterContactAt('2026-11-23').toISOString()).toBe('2026-11-23T04:30:00.000Z');
  });
});

describe('isParkedLater', () => {
  const parked = { status: 'contacted' as const, last_call_outcome: 'later' as const, next_contact_at: '2026-11-23T04:30:00Z' };
  it('is parked until the date, then due', () => {
    expect(isParkedLater(parked, NOW)).toBe(true);
    expect(isParkedLater(parked, new Date('2026-11-23T04:31:00Z'))).toBe(false);
  });
  it('is only a contacted request asked to wait', () => {
    expect(isParkedLater({ ...parked, last_call_outcome: 'call_back' }, NOW)).toBe(false);
    expect(isParkedLater({ ...parked, status: 'approved' }, NOW)).toBe(false);
    expect(isParkedLater({ ...parked, next_contact_at: null }, NOW)).toBe(false);
  });
});

describe('laterEmailRecipient', () => {
  it('prefers the parent on a parent account, else the student', () => {
    expect(laterEmailRecipient({ email: 's@x.com', parent_email: 'p@x.com', account_holder: 'parent' })).toBe('p@x.com');
    expect(laterEmailRecipient({ email: 's@x.com', parent_email: 'p@x.com', account_holder: 'student' })).toBe('s@x.com');
    expect(laterEmailRecipient({ email: null, parent_email: 'p@x.com', account_holder: 'student' })).toBe('p@x.com');
    expect(laterEmailRecipient({ email: ' ', parent_email: null, account_holder: undefined })).toBeNull();
  });
});

describe('family wording', () => {
  it('speaks to the student, with the booking link', () => {
    const msg = laterFamilyMessage({ name: 'priya raman', parent_name: null, account_holder: 'student' }, 'https://neramclasses.com/');
    expect(msg).toContain('Hi Priya, this is Neram Classes');
    expect(msg).toContain('your free NATA and JEE Paper 2 demo class');
    expect(msg).toContain('https://neramclasses.com/demo-class');
  });

  it("speaks to the parent about the child on a parent's account", () => {
    const msg = laterFamilyMessage({ name: 'Ananya', parent_name: 'Ravi Kumar', account_holder: 'parent' }, 'https://neramclasses.com');
    expect(msg).toContain('Hello Ravi');
    expect(msg).toContain("Ananya's free NATA and JEE Paper 2 demo class");
  });

  it('has no em dashes or double dashes, and escapes names in the email', () => {
    const mail = buildLaterEmail({ name: '<b>Ana</b>', parent_name: null, account_holder: 'student' }, 'https://neramclasses.com');
    for (const part of [mail.subject, mail.text, mail.html]) {
      expect(part).not.toMatch(/—|--/);
    }
    expect(mail.html).not.toContain('<b>Ana</b>');
    expect(mail.html).toContain('Pick a demo slot');
  });
});
