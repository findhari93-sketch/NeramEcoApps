// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  accountStatus,
  buildWelcomeLink,
  emailSkipReason,
  isAlreadyRegisteredError,
  removesLastOwner,
  renderInviteEmail,
  validateInvite,
} from './invite';

describe('validateInvite', () => {
  it('lowercases and trims the email, defaults the role to editor', () => {
    const r = validateInvite({ college_id: 'c1', name: ' Dr Ravi ', email: '  Principal@Papni.EDU.in ' });
    expect(r).toEqual({
      ok: true,
      value: { college_id: 'c1', name: 'Dr Ravi', email: 'principal@papni.edu.in', phone: null, designation: null, role: 'editor', request_id: null },
    });
  });

  it('refuses a missing college, name, bad email or unknown role', () => {
    expect(validateInvite({ name: 'a', email: 'a@b.co' }).ok).toBe(false);
    expect(validateInvite({ college_id: 'c', email: 'a@b.co' }).ok).toBe(false);
    expect(validateInvite({ college_id: 'c', name: 'a', email: 'not-an-email' }).ok).toBe(false);
    expect(validateInvite({ college_id: 'c', name: 'a', email: 'a@b.co', role: 'admin' }).ok).toBe(false);
  });
});

describe('emailSkipReason', () => {
  it('skips test domains and a server without Resend', () => {
    expect(emailSkipReason('papni-test-owner@neram.test', true)).toMatch(/test address/);
    expect(emailSkipReason('x@EXAMPLE.com', true)).toMatch(/test address/);
    expect(emailSkipReason('x@example.org', true)).toMatch(/test address/);
    expect(emailSkipReason('x@papni.edu.in', false)).toMatch(/RESEND_API_KEY/);
    expect(emailSkipReason('x@papni.edu.in', true)).toBeNull();
  });
});

describe('buildWelcomeLink', () => {
  it('points at the marketing welcome page with token_hash and type', () => {
    expect(buildWelcomeLink('https://staging.neramclasses.com/', 'abc123', 'invite')).toBe(
      'https://staging.neramclasses.com/college-dashboard/welcome?token_hash=abc123&type=invite',
    );
    expect(buildWelcomeLink('http://localhost:3010', 'h', 'magiclink')).toBe(
      'http://localhost:3010/college-dashboard/welcome?token_hash=h&type=magiclink',
    );
  });
});

describe('isAlreadyRegisteredError', () => {
  it('recognises the Supabase messages and codes', () => {
    expect(isAlreadyRegisteredError({ message: 'A user with this email address has already been registered' })).toBe(true);
    expect(isAlreadyRegisteredError({ code: 'email_exists', message: '' })).toBe(true);
    expect(isAlreadyRegisteredError({ message: 'Rate limit exceeded' })).toBe(false);
    expect(isAlreadyRegisteredError(null)).toBe(false);
  });
});

describe('removesLastOwner', () => {
  const owner = { id: 'a', college_id: 'c', role: 'owner', is_active: true };
  const editor = { id: 'b', college_id: 'c', role: 'editor', is_active: true };
  const otherCollegeOwner = { id: 'z', college_id: 'other', role: 'owner', is_active: true };

  it('is true when demoting or deactivating the only active owner', () => {
    const all = [owner, editor, otherCollegeOwner];
    expect(removesLastOwner(all, owner, { role: 'editor' })).toBe(true);
    expect(removesLastOwner(all, owner, { is_active: false })).toBe(true);
  });

  it('is false when another active owner remains, or the target is not an owner', () => {
    const second = { id: 'd', college_id: 'c', role: 'owner', is_active: true };
    expect(removesLastOwner([owner, second], owner, { role: 'viewer' })).toBe(false);
    expect(removesLastOwner([owner, editor], editor, { is_active: false })).toBe(false);
    expect(removesLastOwner([owner], owner, { role: 'owner' })).toBe(false);
  });

  it('ignores deactivated owners', () => {
    const inactiveOwner = { id: 'e', college_id: 'c', role: 'owner', is_active: false };
    expect(removesLastOwner([owner, inactiveOwner], owner, { role: 'editor' })).toBe(true);
  });
});

describe('accountStatus', () => {
  it('reads deactivated, invited and active', () => {
    expect(accountStatus({ is_active: false, accepted_at: 'x', last_login_at: null })).toBe('deactivated');
    expect(accountStatus({ is_active: true, accepted_at: null, last_login_at: null })).toBe('invited');
    expect(accountStatus({ is_active: true, accepted_at: null, last_login_at: '2026-10-01' })).toBe('active');
    expect(accountStatus({ is_active: true, accepted_at: '2026-10-01', last_login_at: null })).toBe('active');
  });
});

describe('renderInviteEmail', () => {
  it('has the subject, one button and no em dashes', () => {
    const e = renderInviteEmail({
      name: 'Ravi Kumar',
      collegeName: 'Papni School of Architecture',
      link: 'https://neramclasses.com/college-dashboard/welcome?token_hash=x&type=invite',
      role: 'owner',
    });
    expect(e.subject).toBe("You're invited to the Papni School of Architecture dashboard on Neram Classes");
    expect(e.html).toContain('Set up your account');
    expect(e.html).toContain('token_hash=x&amp;type=invite');
    expect(e.text).toContain('Hello Ravi,');
    expect(e.text).toMatch(/works once and expires/);
    expect(`${e.html}${e.text}`).not.toMatch(/—|--|&mdash;/);
  });
});
