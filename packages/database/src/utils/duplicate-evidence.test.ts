import { describe, expect, it } from 'vitest';
import {
  describeBlockedReason,
  describeDuplicateEvidence,
  personLabel,
  shortDateIST,
} from './duplicate-evidence';

const kaira = { id: 'k', name: 'Kaira Rohit', phone: '+918810510825', user_type: 'student' };
const lead = { id: 'l', name: 'User', phone: '+919818997315', user_type: 'lead' };

describe('describeDuplicateEvidence', () => {
  it('spells out the enrolment-link case that looked like a strong match', () => {
    const text = describeDuplicateEvidence(
      'enrollment_link_phone',
      {
        kind: 'link_phone',
        value: '+919818997315',
        link_name: 'Kaira Dalal',
        link_created_at: '2026-07-02T12:53:54Z',
        typed_for: 'k',
        holder: 'l',
      },
      lead,
      kaira,
    );
    expect(text).toBe(
      "Staff typed +91 98189 97315 on Kaira Dalal's enrolment link on 2 Jul 2026. " +
        'Kaira Rohit enrolled through that link from +91 88105 10825, and +91 98189 97315 belongs to an unnamed lead.',
    );
  });

  it('says where a family number came from', () => {
    const text = describeDuplicateEvidence(
      'contact_phone',
      { kind: 'contact', value: '9000000102', source: 'lead_form', relation: 'parent', contact_of: 'k', holder: 'l' },
      kaira,
      { ...lead, name: 'Ramesh Kumar' },
    );
    expect(text).toBe("+91 90000 00102 is the parent phone on Kaira Rohit's application, and Ramesh Kumar signed up with it.");
  });

  it('formats a plain shared number', () => {
    expect(describeDuplicateEvidence('same_phone', { kind: 'phone', value: '8682822310' }, kaira, lead)).toBe(
      'Both records have the number +91 86828 22310.',
    );
  });

  it('falls back to the reason when there is no evidence (older rows)', () => {
    expect(describeDuplicateEvidence('phone_otp_conflict', null, kaira, lead)).toMatch(/OTP was refused/);
    expect(describeDuplicateEvidence('same_phone', null, kaira, lead)).toBe('Both records have the same phone number.');
  });

  it('never uses a long dash', () => {
    const all = [
      describeDuplicateEvidence('same_email', { kind: 'email', value: 'a@b.com' }, kaira, lead),
      ...['shared_number', 'staff_number', 'two_students', 'guardian_account', 'names_differ', 'undone', 'recheck'].map(
        (r) => describeBlockedReason(r) || '',
      ),
    ].join(' ');
    expect(all).not.toMatch(/—|--/);
  });
});

describe('helpers', () => {
  it('describes records without a real name', () => {
    expect(personLabel({ id: 'x', name: 'User', user_type: 'lead' })).toBe('an unnamed lead');
    expect(personLabel({ id: 'x', name: '  ', user_type: 'student' })).toBe('an unnamed student');
    expect(personLabel({ id: 'x', name: 'Pranav' })).toBe('Pranav');
  });

  it('dates in India time, not UTC', () => {
    // 20:00 UTC on 1 Jul is already 2 Jul in India.
    expect(shortDateIST('2026-07-01T20:00:00Z')).toBe('2 Jul 2026');
    expect(shortDateIST(null)).toBeNull();
  });

  it('has words for every guardrail', () => {
    expect(describeBlockedReason('names_differ')).toMatch(/parent or a sibling/);
    expect(describeBlockedReason(null)).toBeNull();
  });
});
