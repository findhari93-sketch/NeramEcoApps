import { describe, it, expect } from 'vitest';
import {
  PUBLIC_VIEW_KEYS,
  maskEmail,
  publicDetailRequestView,
} from './detail-request-view';

/**
 * The link is the only credential this page has, and it lives in a forwardable
 * WhatsApp thread. These tests exist to make a leak fail the build rather than ship.
 */

const fullUser = {
  id: 'user-1',
  first_name: 'Ooveya',
  last_name: 'Velmurugan',
  name: 'Ooveya Velmurugan',
  email: 'Ooveya_Velmurugan@neramclasses.com',
  phone: '+917904479062',
  date_of_birth: '2009-10-06',
  gender: 'female',
  academic_year: '2026-27',
};

const request = { expires_at: '2026-10-02T00:00:00.000Z' };

describe('publicDetailRequestView returns an exact key set', () => {
  it('has only firstName, maskedEmail and expiresAt', () => {
    const view = publicDetailRequestView(fullUser, request);
    expect(Object.keys(view).sort()).toEqual([...PUBLIC_VIEW_KEYS].sort());
  });

  it('leaks none of the values a forwarded link must not disclose', () => {
    const serialised = JSON.stringify(publicDetailRequestView(fullUser, request));
    for (const secret of [
      '7904479062',          // phone
      '2009-10-06',          // date of birth
      'female',              // gender
      'Velmurugan',          // surname, which is also the father's name
      'user-1',              // the internal id
      '2026-27',             // cohort
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('does not echo back answers already on file', () => {
    // A prefilled form would be a read oracle for whoever holds the link.
    const view = publicDetailRequestView(fullUser, request) as unknown as Record<string, unknown>;
    for (const key of ['city', 'state', 'father_name', 'date_of_birth', 'phone', 'academic_data']) {
      expect(key in view).toBe(false);
    }
  });
});

describe('the greeting name', () => {
  it('is the first word of a real name', () => {
    expect(publicDetailRequestView(fullUser, request).firstName).toBe('Ooveya');
  });

  it('falls back from first_name to name', () => {
    const view = publicDetailRequestView(
      { first_name: null, name: 'Ooveya Velmurugan', email: 'a@b.com' },
      request,
    );
    expect(view.firstName).toBe('Ooveya');
  });

  it('greets nobody rather than printing the placeholder name', () => {
    for (const name of ['User', 'student', 'Unnamed Student']) {
      expect(publicDetailRequestView({ name, email: 'a@b.com' }, request).firstName).toBeNull();
    }
  });

  it('never falls back to the mailbox, which would print a surname we did not mean to show', () => {
    const view = publicDetailRequestView(
      { first_name: null, name: null, email: 'Ananya_AnoopPuthan@neramclasses.com' },
      request,
    );
    expect(view.firstName).toBeNull();
    expect(JSON.stringify(view)).not.toContain('AnoopPuthan');
  });

  it('copes with a record holding no name at all, which 29 of them do', () => {
    const view = publicDetailRequestView({}, request);
    expect(view.firstName).toBeNull();
    expect(view.maskedEmail).toBeNull();
  });
});

describe('maskEmail', () => {
  it('keeps one letter and the domain, so the right student recognises it', () => {
    expect(maskEmail('Ooveya_Velmurugan@neramclasses.com')).toBe('OXXX@neramclasses.com');
  });

  it('returns null for anything that is not an address', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('')).toBeNull();
    expect(maskEmail('not-an-email')).toBeNull();
    expect(maskEmail('@leading.com')).toBeNull();
  });
});
