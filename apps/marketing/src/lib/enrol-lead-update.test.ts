import { describe, it, expect } from 'vitest';
import { buildLeadProfileUpdate } from './enrol-lead-update';

const fields = {
  application_number: 'NRM-2610-00009',
  source: 'direct_link',
  status: 'enrolled',
  first_name: 'Asha',
  father_name: null,
  city: '',
  date_of_birth: undefined,
  admin_notes: 'Direct enrollment via link.',
  demo_registration_id: null,
};

describe('buildLeadProfileUpdate', () => {
  it('keeps source, application number and stored values, appends the note', () => {
    const u = buildLeadProfileUpdate(
      { source: 'website_form', admin_notes: 'staff note', application_number: 'NRM-OLD' },
      fields,
    );
    expect(u).toEqual({ status: 'enrolled', first_name: 'Asha', admin_notes: 'staff note\nDirect enrollment via link.' });
    expect('father_name' in u).toBe(false);
    expect('city' in u).toBe(false);
    expect('demo_registration_id' in u).toBe(false);
  });

  it('fills source, number and note when the row has none', () => {
    const u = buildLeadProfileUpdate({ source: null, admin_notes: null, application_number: null }, {
      ...fields,
      demo_registration_id: 'demo-1',
    });
    expect(u.source).toBe('direct_link');
    expect(u.application_number).toBe('NRM-2610-00009');
    expect(u.admin_notes).toBe('Direct enrollment via link.');
    expect(u.demo_registration_id).toBe('demo-1');
  });

  it('keeps zero and false, which are real answers', () => {
    const u = buildLeadProfileUpdate({}, { discount_amount: 0, phone_verified: false });
    expect(u).toEqual({ discount_amount: 0, phone_verified: false });
  });
});
