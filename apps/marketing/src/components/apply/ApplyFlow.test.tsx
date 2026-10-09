import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULT_FORM_DATA } from './types';

const h = vi.hoisted(() => ({
  signInWithGoogleOrRedirect: vi.fn(async (): Promise<any> => ({ uid: 'fb-1' })),
  ensureAccount: vi.fn(async (): Promise<any> => ({ id: 'u-1', phone_verified: false })),
  setShowPhoneVerification: vi.fn(),
  markApplicationStarted: vi.fn(),
  modals: [] as Array<{ open: boolean; phoneOnly?: boolean }>,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@neram/auth', () => ({
  useFirebaseAuth: () => ({ user: null }),
  signInWithGoogleOrRedirect: h.signInWithGoogleOrRedirect,
}));
vi.mock('@/lib/ensure-account', () => ({ ensureAccount: h.ensureAccount }));
vi.mock('@/lib/funnel-tracker', () => ({ trackTaxonomyEvent: vi.fn() }));
vi.mock('@neram/ui', async () => {
  const actual: any = await vi.importActual('@neram/ui');
  return {
    ...actual,
    LoginModal: (props: { open: boolean; phoneOnly?: boolean }) => {
      h.modals.push({ open: props.open, phoneOnly: props.phoneOnly });
      return props.open ? <div data-testid={props.phoneOnly ? 'phone-dialog' : 'login-dialog'} /> : null;
    },
  };
});
vi.mock('./FormContext', () => ({
  useFormContext: () => ({
    formData: structuredClone(DEFAULT_FORM_DATA),
    activeStep: 0,
    setActiveStep: vi.fn(),
    goToNextStep: vi.fn(),
    goToPreviousStep: vi.fn(),
    validateStep: () => ({ isValid: false, errors: [] }),
    showPhoneVerification: false,
    setShowPhoneVerification: h.setShowPhoneVerification,
    onPhoneVerified: vi.fn(),
    isSubmitting: false,
    submissionError: null,
    setSubmissionError: vi.fn(),
    saveDraftToDb: vi.fn(),
    isSavingDraft: false,
    isAuthenticated: false,
    isAuthLoading: false,
    isReturningUser: false,
    returnUserMode: 'new-form',
    returningUserCheckComplete: true,
    submitApplication: vi.fn(),
    markApplicationStarted: h.markApplicationStarted,
    isReturningAccount: false,
    refreshAccount: vi.fn(),
    updateFormData: vi.fn(),
    isFieldPrefilled: () => false,
  }),
}));
vi.mock('./shell/ShellActionsContext', () => ({ useShellLogin: vi.fn() }));
vi.mock('./steps/YourCourseStep', () => ({ default: () => null }));
vi.mock('./steps/ReviewStep', () => ({ default: () => null }));
vi.mock('./steps/PayAndEnrolStep', () => ({ default: () => null }));
vi.mock('./ApplicationDashboard', () => ({ default: () => null }));

import ApplyFlow from './ApplyFlow';

beforeEach(() => {
  h.signInWithGoogleOrRedirect.mockClear();
  h.ensureAccount.mockClear();
  h.setShowPhoneVerification.mockClear();
  h.modals.length = 0;
});
afterEach(() => cleanup());

describe('ApplyFlow: Continue with Google on the form', () => {
  it('goes straight to Google, never opens the sign-in dialog, then asks for the phone', async () => {
    render(<ApplyFlow />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.googleTitle/ }));
    await waitFor(() => expect(h.setShowPhoneVerification).toHaveBeenCalledWith(true));
    expect(h.signInWithGoogleOrRedirect).toHaveBeenCalledTimes(1);
    expect(h.ensureAccount).toHaveBeenCalled();
    expect(screen.queryByTestId('login-dialog')).toBeNull();
    expect(h.modals.filter((m) => !m.phoneOnly).every((m) => !m.open)).toBe(true);
  });

  it('an account with a verified phone skips the OTP', async () => {
    h.ensureAccount.mockImplementationOnce(async () => ({ id: 'u-1', phone_verified: true }));
    render(<ApplyFlow />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.googleTitle/ }));
    await waitFor(() => expect(h.ensureAccount).toHaveBeenCalled());
    expect(h.setShowPhoneVerification).not.toHaveBeenCalledWith(true);
  });

  it('a closed popup does nothing', async () => {
    h.signInWithGoogleOrRedirect.mockImplementationOnce(async () => null);
    render(<ApplyFlow />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.googleTitle/ }));
    await waitFor(() => expect(h.signInWithGoogleOrRedirect).toHaveBeenCalled());
    expect(h.ensureAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a Google failure shows a message under the card', async () => {
    h.signInWithGoogleOrRedirect.mockImplementationOnce(async () => {
      throw Object.assign(new Error('boom'), { code: 'auth/internal-error' });
    });
    render(<ApplyFlow />);
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.googleTitle/ }));
    expect(await screen.findByText('aboutYou.googleFailed')).toBeTruthy();
  });
});
