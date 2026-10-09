import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// The signed-in Firebase user the dialog sees, and the mocked @neram/auth.
// vi.hoisted: vi.mock factories run before ordinary top-level code.
const { currentUser, auth, state } = vi.hoisted(() => {
  const state = { signedIn: true };
  const currentUser: any = {
    uid: 'fb-1',
    email: 'arun@example.com',
    emailVerified: true,
    providerData: [{ providerId: 'google.com' }],
    getIdToken: vi.fn(async () => 'token-1'),
  };
  const auth = {
    getFirebaseAuth: vi.fn(() => ({ currentUser: state.signedIn ? currentUser : null })),
    initRecaptcha: vi.fn(),
    clearRecaptcha: vi.fn(),
    sendPhoneOTP: vi.fn(async (_phone: string) => ({})),
    verifyPhoneOTP: vi.fn(async (_otp: string) => ({})),
    verifyPhoneAndLink: vi.fn(async (_otp: string): Promise<any> => currentUser),
    signInWithPhoneCredential: vi.fn(async (_c: unknown) => ({ getIdToken: async () => 'token-phone' })),
    signInWithGoogleOrRedirect: vi.fn(async (): Promise<any> => currentUser),
    signInWithEmail: vi.fn(async (_e: string, _p: string): Promise<any> => currentUser),
    createAccountWithEmail: vi.fn(async (_e: string, _p: string, _n?: string) => {
      state.signedIn = true;
      return currentUser;
    }),
    refreshEmailVerified: vi.fn(async () => false),
    resendVerificationEmail: vi.fn(async () => undefined),
    resetPassword: vi.fn(async (_e: string) => undefined),
    firebaseSignOut: vi.fn(async () => undefined),
  };
  return { state, currentUser, auth };
});
vi.mock('@neram/auth', () => auth);
vi.mock('../ChatWidget/ConnectToOffice', () => ({ ConnectToOffice: () => <div>office</div> }));

import LoginModal from './LoginModal';

/** register-user says phone not verified; verify-phone and adopt-account succeed. */
function mockServer(registered: { phone_verified: boolean } = { phone_verified: false }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/api/auth/register-user')) return { ok: true, json: async () => ({ user: { id: 'u-1', ...registered } }) };
    if (url.endsWith('/api/auth/verify-phone')) return { ok: true, json: async () => ({ user: { id: 'u-1' } }) };
    if (url.endsWith('/api/auth/adopt-account')) return { ok: true, json: async () => ({ merged: true }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function sendAndEnterOtp() {
  fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
  await screen.findByLabelText('OTP');
  fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));
}

beforeEach(() => {
  Object.values(auth).forEach((fn) => (fn as any).mockClear?.());
  state.signedIn = true;
  currentUser.emailVerified = true;
  currentUser.providerData = [{ providerId: 'google.com' }];
  auth.verifyPhoneAndLink.mockImplementation(async () => currentUser);
  auth.refreshEmailVerified.mockImplementation(async () => false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LoginModal', () => {
  it('links the phone to the signed-in account (never a separate phone sign-in) and reports the number', async () => {
    const fetchMock = mockServer();
    const onAuthenticated = vi.fn();
    render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" onAuthenticated={onAuthenticated} />);
    await sendAndEnterOtp();
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('9876543210'));
    expect(auth.sendPhoneOTP).toHaveBeenCalledWith('+919876543210');
    expect(auth.verifyPhoneAndLink).toHaveBeenCalledWith('123456');
    expect(auth.verifyPhoneOTP).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('https://app.test/api/auth/verify-phone', expect.anything());
  });

  it('uses the dial code and length it is given', async () => {
    mockServer();
    render(<LoginModal open phoneOnly apiBaseUrl="" dialCode="+971" phoneLength={9} />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '501234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(auth.sendPhoneOTP).toHaveBeenCalledWith('+971501234567'));
  });

  it('offers "Sign in with this number" when the number is on another account, and joins them', async () => {
    const fetchMock = mockServer();
    const credential = { providerId: 'phone' };
    auth.verifyPhoneAndLink.mockImplementation(async () => {
      throw Object.assign(new Error('in use'), { code: 'neram/phone-in-use', credential });
    });
    const onAuthenticated = vi.fn();
    render(<LoginModal open phoneOnly apiBaseUrl="" onAuthenticated={onAuthenticated} />);
    await sendAndEnterOtp();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with this number' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('9876543210'));
    expect(auth.signInWithPhoneCredential).toHaveBeenCalledWith(credential);
    const adopt = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/adopt-account'));
    expect(JSON.parse((adopt![1] as any).body)).toEqual({ previousIdToken: 'token-1', idToken: 'token-phone' });
  });

  it('a number another account holds in our database offers only a different number', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/api/auth/verify-phone')
        ? { ok: false, status: 409, json: async () => ({ error: 'PHONE_ALREADY_EXISTS', message: 'This phone number is already registered with another account.' }) }
        : { ok: true, json: async () => ({}) },
    ));
    render(<LoginModal open phoneOnly apiBaseUrl="" />);
    await sendAndEnterOtp();
    expect(await screen.findByRole('button', { name: 'Use a different number' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with this number' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different number' }));
    expect(await screen.findByLabelText('Phone Number')).toBeTruthy();
  });

  it('email sign-up waits on the verification link, then moves on to the phone', async () => {
    mockServer();
    state.signedIn = false;
    currentUser.emailVerified = false;
    currentUser.providerData = [{ providerId: 'password' }];
    render(<LoginModal open requireEmailVerification apiBaseUrl="" />);
    // The dialog first checks for an unverified session (nobody is signed in yet).
    await waitFor(() => expect(auth.getFirebaseAuth).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign Up" }));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Arun Kumar' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'arun@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up with Email' }));

    expect(await screen.findByText('Check your inbox')).toBeTruthy();
    expect(auth.createAccountWithEmail).toHaveBeenCalledWith('arun@example.com', 'secret123', 'Arun Kumar');

    // Not yet clicked: stays here and says so.
    fireEvent.click(screen.getByRole('button', { name: "I've verified my email" }));
    expect(await screen.findByText(/Not verified yet/)).toBeTruthy();

    // Clicked: on to the phone.
    auth.refreshEmailVerified.mockImplementation(async () => {
      currentUser.emailVerified = true;
      return true;
    });
    fireEvent.click(screen.getByRole('button', { name: "I've verified my email" }));
    expect(await screen.findByText('Verify Your Phone')).toBeTruthy();
  });

  it('reopening for an unverified email account goes straight back to "Check your inbox"', async () => {
    mockServer();
    currentUser.emailVerified = false;
    currentUser.providerData = [{ providerId: 'password' }];
    render(<LoginModal open phoneOnly requireEmailVerification apiBaseUrl="" />);
    expect(await screen.findByText('Check your inbox')).toBeTruthy();
  });

  it('does not ask an email account to verify when the page does not require it', async () => {
    mockServer();
    currentUser.emailVerified = false;
    currentUser.providerData = [{ providerId: 'password' }];
    render(<LoginModal open apiBaseUrl="" />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'arun@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In with Email' }));
    expect(await screen.findByText('Verify Your Phone')).toBeTruthy();
  });

  it('a late initialPhone change does not wipe an OTP being typed', async () => {
    mockServer();
    const { rerender } = render(<LoginModal open phoneOnly apiBaseUrl="" initialPhone="" />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP');
    fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '12' } });
    rerender(<LoginModal open phoneOnly apiBaseUrl="" initialPhone="9123456789" />);
    expect((screen.getByLabelText('OTP') as HTMLInputElement).value).toBe('12');
  });

  it('turns Firebase errors into plain words', async () => {
    mockServer();
    auth.signInWithEmail.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), { code: 'auth/invalid-credential' });
    });
    render(<LoginModal open apiBaseUrl="" />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'arun@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In with Email' }));
    expect(await screen.findByText(/Email or password is incorrect/)).toBeTruthy();
    expect(screen.queryByText(/Firebase: Error/)).toBeNull();
  });

  it('Forgot password sends a reset link without saying whether the account exists', async () => {
    mockServer();
    render(<LoginModal open apiBaseUrl="" />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'arun@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(await screen.findByText(/If arun@example.com has an account/)).toBeTruthy();
    expect(auth.resetPassword).toHaveBeenCalledWith('arun@example.com');
  });

  it('a closed Google popup is silent', async () => {
    mockServer();
    auth.signInWithGoogleOrRedirect.mockImplementationOnce(async () => null);
    render(<LoginModal open apiBaseUrl="" />);
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await waitFor(() => expect(auth.signInWithGoogleOrRedirect).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Sign In')).toBeTruthy();
  });
});
