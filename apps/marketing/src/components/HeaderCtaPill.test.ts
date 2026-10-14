import { describe, it, expect } from 'vitest';
import { ctaTone } from './HeaderCtaPill';

describe('ctaTone', () => {
  it('new visitors get the orange Join Now half', () => {
    expect(ctaTone(null as never)).toBe('join');
    expect(ctaTone('none' as never)).toBe('join');
  });

  it('paid, enrolled and approved students get green', () => {
    expect(ctaTone('enrolled')).toBe('success');
    expect(ctaTone('partial_payment')).toBe('success');
    expect(ctaTone('approved')).toBe('success');
  });

  it('applications in progress get the solid blue half, never white on white', () => {
    for (const s of ['draft', 'submitted', 'under_review', 'pending_verification'] as const) {
      expect(ctaTone(s)).toBe('progress');
    }
  });
});
