import { describe, expect, it } from 'vitest';
import { fromRequest, sameForm } from './EditDetailsDialog';

const request = {
  name: 'Kunisetty Radhika',
  phone: '+917382843549',
  email: 'leelapriyamvada@gmail.com',
  current_class: '12th',
  exam_year: 2028,
  parent_name: null,
  parent_phone: null,
  parent_email: null,
  parent_joining: false,
  account_holder: 'student',
} as any;

describe('sameForm (Save stays off until something changes)', () => {
  it('an untouched form is not a change', () => {
    expect(sameForm(fromRequest(request), fromRequest(request))).toBe(true);
  });

  it('a stray space is not a change', () => {
    expect(sameForm({ ...fromRequest(request), name: 'Kunisetty Radhika ' }, fromRequest(request))).toBe(true);
  });

  it('the same mobile written another way is not a change', () => {
    expect(sameForm({ ...fromRequest(request), phone: '7382843549' }, fromRequest(request))).toBe(true);
  });

  it('a real edit is a change', () => {
    expect(sameForm({ ...fromRequest(request), name: 'Radhika K' }, fromRequest(request))).toBe(false);
    expect(sameForm({ ...fromRequest(request), parentJoining: true }, fromRequest(request))).toBe(false);
    expect(sameForm({ ...fromRequest(request), examYear: '2027' }, fromRequest(request))).toBe(false);
  });
});
