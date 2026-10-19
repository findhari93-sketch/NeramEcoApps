// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chooseFamilySurvivor, chooseSurvivorOrder } from '../duplicates';

type P = { id: string; name: string | null; user_type: string; ms_oid: string | null; email: string | null };
const student: P = { id: 's', name: 'Keerthana SureshMurugan', user_type: 'student', ms_oid: 'oid', email: 'k@neramclasses.com' };
const parentLead: P = { id: 'p', name: 'N Suresh Murugan', user_type: 'lead', ms_oid: null, email: 'nsm@gmail.com' };
const unnamed: P = { id: 'u', name: 'User', user_type: 'lead', ms_oid: null, email: null };

describe('chooseFamilySurvivor', () => {
  it('keeps the student, even when the parent lead has more history', () => {
    expect(chooseFamilySurvivor(parentLead, student, { p: 40, s: 2 })[0].id).toBe('s');
    expect(chooseFamilySurvivor(student, parentLead, { p: 40, s: 2 })[0].id).toBe('s');
  });

  it('keeps the named lead over an unnamed one when neither is a student', () => {
    expect(chooseFamilySurvivor(unnamed, parentLead, { u: 9, p: 1 })[0].id).toBe('p');
  });

  it('falls back to the busier record on a tie', () => {
    const a = { ...unnamed, id: 'a' };
    const b = { ...unnamed, id: 'b' };
    expect(chooseFamilySurvivor(a, b, { a: 1, b: 5 })[0].id).toBe('b');
  });
});

describe('chooseSurvivorOrder', () => {
  it('still prefers more references, then the older row, for a same-person merge', () => {
    const x = { id: 'x', email: 'a@gmail.com', created_at: '2026-01-01' };
    const y = { id: 'y', email: 'b@gmail.com', created_at: '2026-02-01' };
    expect(chooseSurvivorOrder(x, y, { x: 1, y: 3 })[0].id).toBe('y');
    expect(chooseSurvivorOrder(x, y, {})[0].id).toBe('x');
  });
});
