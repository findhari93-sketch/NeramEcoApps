import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { id: 'fb-1' } as { id: string } | null, account: { phone: '9876543210', phone_verified: true, email: 'p@example.com' } as Record<string, unknown> }));
const tracked = vi.hoisted(() => ({ conversions: [] as unknown[] }));

vi.mock('@neram/auth', () => ({ useFirebaseAuth: () => ({ user: auth.user, loading: false }) }));
vi.mock('@neram/ui/analytics', () => ({ trackApplicationSubmitted: (p: unknown) => tracked.conversions.push(p) }));
vi.mock('@/lib/funnel-tracker', () => ({ trackTaxonomyEvent: vi.fn() }));
vi.mock('@/lib/attribution', () => ({ leadAttribution: () => ({ utm_source: 'aintra-test' }) }));
vi.mock('@/lib/ensure-account', () => ({ ensureAccount: async () => auth.account }));
vi.mock('@/components/demo-class/demo-client', () => ({ currentIdToken: async () => 'token-1' }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ApplicationCard from './ApplicationCard';

const COMPLETE = {
  id: 'd1',
  status: 'draft',
  first_name: 'Priya Kumar',
  father_name: 'Kumar S',
  phone: '9876543210',
  date_of_birth: '2009-05-14',
  country: 'IN',
  pincode: '600020',
  city: 'Chennai',
  state: 'Tamil Nadu',
  applicant_category: 'school_student',
  academic_data: { current_class: '11', school_name: 'DAV School', board: 'cbse' },
  target_exam_year: 2028,
  interest_course: 'nata',
  fee_structure_id: 'fs-1y',
};

let apps: Record<string, unknown>[] = [];
let posted: Record<string, unknown> | null = null;

beforeEach(() => {
  auth.user = { id: 'fb-1' };
  auth.account = { phone: '9876543210', phone_verified: true, email: 'p@example.com' };
  tracked.conversions = [];
  posted = null;
  apps = [COMPLETE];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/fee-structures')) {
      return new Response(JSON.stringify({ feeStructures: [{ id: 'fs-1y', display_name: 'One Year Long Program' }] }));
    }
    if (init?.method === 'POST') {
      posted = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ success: true, data: { id: 'd1', application_number: 'NERAM-2026-0042' }, applicationConversion: true }), { status: 201 });
    }
    return new Response(JSON.stringify({ success: true, data: apps }));
  }) as unknown as typeof fetch;
});
afterEach(() => cleanup());

describe('ApplicationCard', () => {
  it('shows a complete draft to check, and submits only after the terms are ticked', async () => {
    render(<ApplicationCard />);
    await screen.findByText('Check and submit your application');
    expect(screen.getByText('Class 11, DAV School, CBSE')).toBeTruthy();
    expect(screen.getByText('One Year Long Program')).toBeTruthy();

    const submit = screen.getByRole('button', { name: 'Submit application' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await screen.findByText('Application submitted');
    expect(screen.getByRole('status').textContent).toContain('NERAM-2026-0042');
    expect(posted).toMatchObject({ status: 'submitted', first_name: 'Priya Kumar', phone: '9876543210', fee_structure_id: 'fs-1y', utm_source: 'aintra-test' });
    expect(tracked.conversions).toEqual([{ applicationId: 'd1', phone: '9876543210', email: 'p@example.com' }]);
  });

  it('asks for a phone check before submitting when the number is not verified', async () => {
    auth.account = { phone: '9876543210', phone_verified: false, email: null };
    render(<ApplicationCard />);
    await screen.findByRole('button', { name: 'Verify your phone to submit' });
    expect(screen.queryByRole('button', { name: 'Submit application' })).toBeNull();
  });

  it('lists what is still needed for an unfinished draft, with the full form as a way out', async () => {
    apps = [{ id: 'd1', status: 'draft', first_name: 'Priya Kumar' }];
    render(<ApplicationCard />);
    await screen.findByText('Your application so far');
    expect(screen.getByText(/father's name/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Finish on the full form instead' }).getAttribute('href')).toBe('/apply');
  });

  it('shows an application that is already in, instead of a new one', async () => {
    apps = [{ id: 'a1', status: 'submitted', application_number: 'NERAM-2026-0007' }];
    render(<ApplicationCard />);
    await screen.findByText('You have already applied');
    expect(screen.getByText(/NERAM-2026-0007/)).toBeTruthy();
  });

  it('asks a guest to sign in', async () => {
    auth.user = null;
    render(<ApplicationCard />);
    await waitFor(() => expect(screen.getByText('Sign in to start your application')).toBeTruthy());
  });
});
