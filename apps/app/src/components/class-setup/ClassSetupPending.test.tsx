import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NeramThemeProvider } from '@neram/ui';

vi.mock('@neram/auth', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => 'token' } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/post-enrollment/OnboardingChecklist', () => ({
  default: () => <div>Old checklist</div>,
}));

import ClassSetupPending, { type ClassSetupPendingData } from './ClassSetupPending';
import ClassSetupCard from './ClassSetupCard';

const waiting: ClassSetupPendingData = {
  ready: false,
  firstName: 'Radhika',
  pending: { stage: 'account', email: 'student@gmail.com' },
};

const wrap = (ui: React.ReactElement) => render(<NeramThemeProvider>{ui}</NeramThemeProvider>);

describe('ClassSetupPending', () => {
  it('says the payment is being checked', () => {
    wrap(<ClassSetupPending initial={{ ...waiting, pending: { stage: 'checking', email: null } }} onRefresh={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Hi Radhika, you're almost in/ })).toBeTruthy();
    expect(screen.getByText(/checking your payment/)).toBeTruthy();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toContain('Payment checked, happening now');
  });

  it('names the email the account will be sent to, and has no group link', () => {
    wrap(<ClassSetupPending initial={waiting} onRefresh={vi.fn()} />);
    expect(screen.getByText(/We will email student@gmail.com/)).toBeTruthy();
    expect(document.querySelector('a[href*="chat.whatsapp.com"]')).toBeNull();
  });

  it('checks again and says it is still being made', async () => {
    const onRefresh = vi.fn(async () => waiting);
    wrap(<ClassSetupPending initial={waiting} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('still being made'));
  });
});

function replyWith(data: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data }), { status: 200 })));
}

describe('ClassSetupCard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the 5-step progress and continues to /onboarding', async () => {
    replyWith({ ready: true, count: 2, total: 5 });
    wrap(<ClassSetupCard />);
    expect(await screen.findByText(/2 of 5 done/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/onboarding');
    expect(screen.queryByText('Old checklist')).toBeNull();
  });

  it('says the account is on its way while pending', async () => {
    replyWith({ ready: false, pending: { stage: 'checking' } });
    wrap(<ClassSetupCard />);
    expect(await screen.findByText('Your class account is on its way')).toBeTruthy();
  });

  it('keeps the old checklist for students outside the new flow', async () => {
    replyWith({ ready: false, pending: null });
    wrap(<ClassSetupCard />);
    expect(await screen.findByText('Old checklist')).toBeTruthy();
  });

  it('hides once all five are done', async () => {
    replyWith({ ready: true, count: 5, total: 5 });
    const { container } = wrap(<ClassSetupCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.MuiSkeleton-root')).toBeNull());
    expect(screen.queryByText(/class setup/i)).toBeNull();
  });
});
