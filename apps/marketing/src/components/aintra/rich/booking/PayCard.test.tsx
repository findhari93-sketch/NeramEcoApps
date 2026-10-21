import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { id: 'fb-1' } as { id: string } | null }));

vi.mock('@neram/auth', () => ({ useFirebaseAuth: () => ({ user: auth.user, loading: false }) }));
vi.mock('@/components/demo-class/demo-client', () => ({ currentIdToken: async () => 'token-1' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PayCard from './PayCard';
import SaveCollegeCard from './SaveCollegeCard';

let payload: Record<string, unknown> = {};
let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  auth.user = { id: 'fb-1' };
  calls = [];
  window.localStorage.clear();
  payload = {
    actions: [
      { id: 'link', label: 'Finish your enrolment and pay ₹25,000', href: '/enroll?token=t1' },
      { id: 'balance', label: 'Pay ₹13,500 (instalment 2, due 5 Nov 2026)', href: '/pay-balance' },
    ],
    pending: null,
  };
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('/api/colleges/saved')) return new Response(JSON.stringify({ success: true }));
    return new Response(JSON.stringify(payload));
  }) as unknown as typeof fetch;
});
afterEach(() => cleanup());

describe('PayCard', () => {
  it('shows one button per payment, each opening its payment page', async () => {
    render(<PayCard />);
    const first = await screen.findByRole('link', { name: 'Finish your enrolment and pay ₹25,000' });
    expect(first.getAttribute('href')).toBe('/enroll?token=t1');
    expect(screen.getByRole('link', { name: /Pay ₹13,500/ }).getAttribute('href')).toBe('/pay-balance');
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer token-1' });
  });

  it('says a sent payment is with our team, and nothing is due', async () => {
    payload = { actions: [], pending: { amount: 13500, submittedAt: null } };
    render(<PayCard />);
    await screen.findByText(/₹13,500 is with our team to verify/);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('asks a guest to sign in and loads nothing', async () => {
    auth.user = null;
    render(<PayCard />);
    await screen.findByText('Sign in to see your fees');
    expect(calls).toHaveLength(0);
  });
});

describe('SaveCollegeCard', () => {
  const suggestion = { kind: 'save-college' as const, date: null, window: null, draft: { fields: { collegeId: 'col-1', collegeName: 'Papni School of Architecture', slug: 'papni' } } };

  it('saves to the account and to this device, so the saved page lists it', async () => {
    render(<SaveCollegeCard suggestion={suggestion} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to my list' }));
    await screen.findByText('Saved to your list');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ college_id: 'col-1', action: 'save' });
    expect(JSON.parse(window.localStorage.getItem('neram_saved_colleges') || '[]')).toEqual(['papni']);
  });

  it('a guest saves on this device only', async () => {
    auth.user = null;
    render(<SaveCollegeCard suggestion={suggestion} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to my list' }));
    await waitFor(() => expect(screen.getByText('Saved to your list')).toBeTruthy());
    expect(calls).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem('neram_saved_colleges') || '[]')).toEqual(['papni']);
  });
});
