import { describe, it, expect } from 'vitest';
import { findIdentityCandidates, firstNameKey, normalizePhone } from './identity-candidates';

/**
 * Production, 2026-08-14: a student paid with Gmail on 13 Aug (enrolled, no
 * Microsoft account). The next day her new Afrin_banu@neramclasses.com account
 * was added from "Not yet in class" and a second student record appeared.
 */
const GMAIL_ROW = {
  user_id: 'gmail-row',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  personal_email: null,
  phone: '+916382901455',
  enrolled_at: '2026-08-13T12:45:27Z',
};

const OTHER_ROW = {
  user_id: 'other-row',
  name: 'Aryakumar Amitkumar',
  email: 'arya@example.com',
  personal_email: null,
  phone: '+919999999999',
  enrolled_at: '2026-04-03T00:00:00Z',
};

describe('normalizePhone', () => {
  it('keeps the last ten digits', () => {
    expect(normalizePhone('+91 63829 01455')).toBe('6382901455');
    expect(normalizePhone('6382901455')).toBe('6382901455');
  });

  it('rejects anything shorter than ten digits', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('firstNameKey', () => {
  it('reads the first name from a display name or an address', () => {
    expect(firstNameKey('Afrin banu')).toBe('afrin');
    expect(firstNameKey('Afrin_banu@neramclasses.com')).toBe('afrin');
    expect(firstNameKey('HariHeera@neramclasses.com')).toBe('hari');
  });

  it('ignores case, padding and optional letters', () => {
    expect(firstNameKey('CHETANA ')).toBe(firstNameKey('Chetana AjayKumar'));
    expect(firstNameKey('Dhisha')).toBe(firstNameKey('Disha'));
  });
});

describe('findIdentityCandidates', () => {
  it('proposes the paid Gmail record for the new org account (the duplicate this prevents)', () => {
    const found = findIdentityCandidates(
      { name: 'Afrin banu', upn: 'Afrin_banu@neramclasses.com' },
      [GMAIL_ROW, OTHER_ROW],
    );
    expect(found).toEqual([
      {
        user_id: 'gmail-row',
        name: 'Afrin',
        email: 'afrinbanu20101@gmail.com',
        enrolled_at: '2026-08-13T12:45:27Z',
        reason: 'name',
      },
    ]);
  });

  it('labels a phone match', () => {
    const found = findIdentityCandidates(
      { name: 'Someone Else', upn: 'someone@neramclasses.com', phones: ['+91 63829 01455'] },
      [GMAIL_ROW, OTHER_ROW],
    );
    expect(found.map((c) => [c.user_id, c.reason])).toEqual([['gmail-row', 'phone']]);
  });

  it('labels a personal email match regardless of case', () => {
    const found = findIdentityCandidates(
      { name: 'Someone Else', upn: 'someone@neramclasses.com', emails: ['AfrinBanu20101@gmail.com'] },
      [GMAIL_ROW],
    );
    expect(found[0].reason).toBe('email');
  });

  it('orders phone matches before name matches', () => {
    const nameTwin = { ...OTHER_ROW, user_id: 'name-twin', name: 'Afrin S', phone: null };
    const found = findIdentityCandidates(
      { name: 'Afrin banu', upn: 'Afrin_banu@neramclasses.com', phones: ['9999999999'] },
      [nameTwin, OTHER_ROW],
    );
    expect(found.map((c) => c.user_id)).toEqual(['other-row', 'name-twin']);
  });

  it('ignores first names shorter than three letters', () => {
    const found = findIdentityCandidates(
      { name: 'Al Khan', upn: 'Al_Khan@neramclasses.com' },
      [{ ...OTHER_ROW, user_id: 'al', name: 'Al' }],
    );
    expect(found).toEqual([]);
  });

  it('returns nothing when no row resembles the account', () => {
    expect(
      findIdentityCandidates({ name: 'Dhisha Haribabu', upn: 'Dhisha_Haribabu@neramclasses.com' }, [OTHER_ROW]),
    ).toEqual([]);
  });
});
