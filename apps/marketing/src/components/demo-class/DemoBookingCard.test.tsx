import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- mocks ----
const authState: { user: null | { uid: string; name: string | null; email: string | null }; loading: boolean } = {
  user: null,
  loading: false,
};
const signInWithGoogleOrRedirect = vi.fn();
vi.mock('@neram/auth', () => ({
  useFirebaseAuth: () => authState,
  signInWithGoogleOrRedirect: (...a: unknown[]) => signInWithGoogleOrRedirect(...a),
  firebaseSignOut: vi.fn(),
  getFirebaseAuth: () => ({ currentUser: null }),
}));

vi.mock('@neram/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neram/ui')>();
  return {
    ...actual,
    // The real dialog runs Firebase; the card only needs to know it opened.
    LoginModal: ({ open, phoneOnly, onAuthenticated }: { open: boolean; phoneOnly?: boolean; onAuthenticated?: () => void }) =>
      open ? (
        <div data-testid="otp-dialog" data-phone-only={String(!!phoneOnly)}>
          <button onClick={() => onAuthenticated?.()}>finish otp</button>
        </div>
      ) : null,
  };
});

const ensureAccount = vi.fn();
vi.mock('@/lib/ensure-account', () => ({ ensureAccount: (...a: unknown[]) => ensureAccount(...a) }));

const submitDemoRequest = vi.fn();
vi.mock('./demo-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demo-client')>();
  return {
    ...actual,
    fetchMyDemo: vi.fn().mockResolvedValue({ signedIn: true, request: null }),
    submitDemoRequest: (...a: unknown[]) => submitDemoRequest(...a),
    fireDemoConversion: vi.fn(),
  };
});
vi.mock('@/lib/funnel-tracker', () => ({ trackTaxonomyEvent: vi.fn() }));
vi.mock('@/lib/attribution', () => ({ touchAttribution: (pageCode?: string) => ({ page_code: pageCode ?? null }) }));

import DemoBookingCard from './DemoBookingCard';

const VERIFIED = { id: 'u1', name: 'Priya Devi', email: 'priya@gmail.com', phone: '+919876543210', phone_verified: true, email_verified: true };
const UNVERIFIED = { ...VERIFIED, phone: null, phone_verified: false };

/** Start on "Who is joining?" with "any time" picked. */
function startOnStep2(extra: Record<string, unknown> = {}) {
  window.sessionStorage.setItem(
    'neram_demo_draft',
    JSON.stringify({ step: 1, date: null, window: 'anytime', name: '', currentClass: '', language: 'en', parentJoining: false, parentName: '', parentPhone: '', ...extra }),
  );
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ json: async () => ({}) }) as unknown as typeof fetch;
  authState.user = null;
  authState.loading = false;
  window.history.replaceState({}, '', '/demo-class');
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('DemoBookingCard, step 2', () => {
  it('signed out: shows Google and phone sign-in, and no details yet', async () => {
    startOnStep2();
    render(<DemoBookingCard />);
    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Use my phone number/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Student name/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Request my free demo/ })).toBeNull();
  });

  it('a draft saved on the old third step opens on step 2 of 2', async () => {
    startOnStep2({ step: 2 });
    render(<DemoBookingCard />);
    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByText('Who is joining?')).toBeTruthy();
  });

  it('phone: opens the OTP dialog on its own (phone sign-in)', async () => {
    startOnStep2();
    render(<DemoBookingCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Use my phone number/ }));
    expect(screen.getByTestId('otp-dialog').dataset.phoneOnly).toBe('true');
  });

  it('Google with no verified phone goes straight to the OTP', async () => {
    startOnStep2();
    signInWithGoogleOrRedirect.mockResolvedValue({ uid: 'g1' });
    ensureAccount.mockResolvedValue(UNVERIFIED);
    render(<DemoBookingCard />);
    fireEvent.click(await screen.findByText('Continue with Google'));
    await waitFor(() => expect(screen.getByTestId('otp-dialog')).toBeTruthy());
    expect(ensureAccount).toHaveBeenCalledWith({ force: true });
  });

  it('Google closed (null): no dialog, still on the sign-in choice', async () => {
    startOnStep2();
    signInWithGoogleOrRedirect.mockResolvedValue(null);
    render(<DemoBookingCard />);
    fireEvent.click(await screen.findByText('Continue with Google'));
    await waitFor(() => expect(signInWithGoogleOrRedirect).toHaveBeenCalled());
    expect(screen.queryByTestId('otp-dialog')).toBeNull();
  });

  it('signed in and verified: name pre-filled, phone verified, only class and language left', async () => {
    startOnStep2();
    authState.user = { uid: 'g1', name: 'Priya Devi', email: 'priya@gmail.com' };
    ensureAccount.mockResolvedValue(VERIFIED);
    render(<DemoBookingCard />);
    const name = (await screen.findByLabelText(/Student name/)) as HTMLInputElement;
    expect(name.value).toBe('Priya Devi');
    expect(screen.getByText('Pre-filled')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('+91 98xxx xx210')).toBeTruthy();
    expect(screen.queryByTestId('otp-dialog')).toBeNull();
    expect((screen.getByRole('button', { name: /Request my free demo/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('never overwrites a name the student already typed', async () => {
    startOnStep2({ name: 'Asha' });
    authState.user = { uid: 'g1', name: 'Priya Devi', email: 'priya@gmail.com' };
    ensureAccount.mockResolvedValue(VERIFIED);
    render(<DemoBookingCard />);
    const name = (await screen.findByLabelText(/Student name/)) as HTMLInputElement;
    expect(name.value).toBe('Asha');
    expect(screen.queryByText('Pre-filled')).toBeNull();
  });

  it('signed in without a verified phone: asks for the OTP once and blocks the request', async () => {
    startOnStep2({ name: 'Priya' });
    authState.user = { uid: 'g1', name: 'Priya', email: null };
    ensureAccount.mockResolvedValueOnce(UNVERIFIED).mockResolvedValue(VERIFIED);
    render(<DemoBookingCard />);
    expect(await screen.findByTestId('otp-dialog')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Request my free demo/ }) as HTMLButtonElement).disabled).toBe(true);

    // OTP done: the account is re-read and the request opens up.
    fireEvent.click(screen.getByText('finish otp'));
    await waitFor(() => expect(screen.getByText('Verified')).toBeTruthy());
    expect((screen.getByRole('button', { name: /Request my free demo/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('came from the application: carries the name and class, and tags the request', async () => {
    window.history.replaceState({}, '', '/demo-class?from=apply');
    window.localStorage.setItem(
      'neram_application_draft',
      JSON.stringify({
        formData: { personal: { firstName: 'Kiran' }, academic: { applicantCategory: 'school_student', schoolStudentData: { current_class: '12' } } },
        savedAt: new Date().toISOString(),
      }),
    );
    startOnStep2();
    window.sessionStorage.clear(); // a fresh visit from /apply has no demo draft yet
    authState.user = { uid: 'g1', name: 'Priya Devi', email: null };
    ensureAccount.mockResolvedValue(VERIFIED);
    submitDemoRequest.mockResolvedValue({ ok: true, request: { ref: 'DEMO-1', status: 'pending' } });
    render(<DemoBookingCard />);

    // Step 1 first (no saved draft): pick any time, then continue.
    fireEvent.click(await screen.findByText('Any time works, just call me'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const name = (await screen.findByLabelText(/Student name/)) as HTMLInputElement;
    expect(name.value).toBe('Kiran');
    expect(screen.getByRole('button', { name: /Class 12/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Request my free demo/ }));
    await waitFor(() => expect(submitDemoRequest).toHaveBeenCalled());
    expect(submitDemoRequest.mock.calls[0][1]).toEqual({ page_code: 'DC-APL' });
  });
});
