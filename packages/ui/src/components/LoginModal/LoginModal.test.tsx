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
  // The sixth digit verifies by itself: no Verify tap.
  fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '123456' } });
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
  it('lets a Gulf student pick their country and sends the OTP there', async () => {
    mockServer();
    const onAuthenticated = vi.fn();
    render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" onAuthenticated={onAuthenticated} />);
    fireEvent.click(screen.getByRole('button', { name: /Country code \+91/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /United Arab Emirates/ }));
    expect(screen.getByText(/Enter your 9-digit mobile number/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '551993240' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP');
    fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '123456' } });
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('551993240', '+971551993240'));
    expect(auth.sendPhoneOTP).toHaveBeenCalledWith('+971551993240');
  });

  it('opens on the country of a prefilled Gulf number, and a pasted number picks its own', async () => {
    mockServer();
    render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" initialPhone="+966512345678" />);
    expect(screen.getByRole('button', { name: /Country code \+966/ })).toBeTruthy();
    expect((screen.getByLabelText('Phone Number') as HTMLInputElement).value).toBe('512345678');
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '+974 5512 3456' } });
    expect(screen.getByRole('button', { name: /Country code \+974/ })).toBeTruthy();
    expect((screen.getByLabelText('Phone Number') as HTMLInputElement).value).toBe('55123456');
  });

  it('links the phone to the signed-in account (never a separate phone sign-in) and reports the number', async () => {
    const fetchMock = mockServer();
    const onAuthenticated = vi.fn();
    render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" onAuthenticated={onAuthenticated} />);
    await sendAndEnterOtp();
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('9876543210', '+919876543210'));
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
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('9876543210', '+919876543210'));
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

  it('verifies by itself on the sixth digit, once, and says where the code went', async () => {
    mockServer();
    const onAuthenticated = vi.fn();
    render(<LoginModal open phoneOnly apiBaseUrl="" onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP');
    expect(screen.getByText('+91 98765 43210')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Resend in 30s/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '12345' } });
    expect(auth.verifyPhoneAndLink).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '123456' } });
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('9876543210', '+919876543210'));
    expect(auth.verifyPhoneAndLink).toHaveBeenCalledTimes(1);
  });

  it('a wrong code is not retried by itself; changing it tries again', async () => {
    mockServer();
    auth.verifyPhoneAndLink.mockImplementationOnce(async () => {
      throw Object.assign(new Error('bad code'), { code: 'auth/invalid-verification-code' });
    });
    render(<LoginModal open phoneOnly apiBaseUrl="" />);
    await sendAndEnterOtp();
    await waitFor(() => expect(auth.verifyPhoneAndLink).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeTruthy());
    expect(auth.verifyPhoneAndLink).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('OTP'), { target: { value: '654321' } });
    await waitFor(() => expect(auth.verifyPhoneAndLink).toHaveBeenCalledTimes(2));
  });

  it('Edit next to the number goes back to the phone step', async () => {
    mockServer();
    render(<LoginModal open phoneOnly apiBaseUrl="" />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Phone Number')).toBeTruthy();
  });

  it('Enter on the phone number sends the OTP', async () => {
    mockServer();
    render(<LoginModal open phoneOnly apiBaseUrl="" />);
    const field = screen.getByLabelText('Phone Number');
    fireEvent.change(field, { target: { value: '9876543210' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(auth.sendPhoneOTP).toHaveBeenCalledWith('+919876543210'));
  });

  it('fills the code from the SMS where the browser can read it (WebOTP)', async () => {
    mockServer();
    const onAuthenticated = vi.fn();
    (window as any).OTPCredential = function OTPCredential() {};
    const get = vi.fn(async () => ({ code: '424242' }));
    Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true });
    try {
      render(<LoginModal open phoneOnly apiBaseUrl="" onAuthenticated={onAuthenticated} />);
      fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      await waitFor(() => expect(auth.verifyPhoneAndLink).toHaveBeenCalledWith('424242'));
      expect(get).toHaveBeenCalledWith(expect.objectContaining({ otp: { transport: ['sms'] } }));
    } finally {
      delete (window as any).OTPCredential;
    }
  });

  /** The capture-phone bodies, in the order they were sent. */
  function captureBodies(fetchMock: ReturnType<typeof mockServer>) {
    return fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/api/auth/capture-phone'))
      .map(([, init]) => JSON.parse((init as any).body));
  }

  it('saves the number for staff while signed out, before the OTP goes out, then marks it sent', async () => {
    state.signedIn = false;
    const fetchMock = mockServer();
    render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP');

    await waitFor(() => expect(captureBodies(fetchMock).map((b) => b.event)).toEqual(['entered', 'otp_sent']));
    const [entered] = captureBodies(fetchMock);
    expect(entered.phoneNumber).toBe('+919876543210');
    expect(entered.idToken).toBeUndefined();
    expect(entered.anonymousId).toMatch(/^anon_[0-9a-f]{32}$/);
  });

  it('saves the failure reason when the OTP cannot be sent', async () => {
    state.signedIn = false;
    const fetchMock = mockServer();
    auth.sendPhoneOTP.mockRejectedValueOnce(Object.assign(new Error('Too many'), { code: 'auth/too-many-requests' }));
    render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    await waitFor(() => expect(captureBodies(fetchMock).map((b) => b.event)).toEqual(['entered', 'failed']));
    expect(captureBodies(fetchMock)[1]).toMatchObject({ errorCode: 'auth/too-many-requests' });
  });

  it('says the student closed the dialog after the OTP went out', async () => {
    state.signedIn = false;
    const fetchMock = mockServer();
    const onClose = vi.fn();
    render(<LoginModal open phoneOnly allowClose onClose={onClose} apiBaseUrl="https://app.test" />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(captureBodies(fetchMock).map((b) => b.event)).toEqual(['entered', 'otp_sent', 'closed']));
    expect(captureBodies(fetchMock)[2].phoneNumber).toBe('+919876543210');
  });

  it('tells our server failing apart from a wrong code', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/api/auth/verify-phone')
        ? { ok: false, status: 500, json: async () => ({ error: 'boom' }) }
        : { ok: true, json: async () => ({}) },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginModal open phoneOnly apiBaseUrl="" />);
    await sendAndEnterOtp();

    await waitFor(() =>
      expect(captureBodies(fetchMock as any).map((b) => b.event)).toEqual(['entered', 'otp_sent', 'otp_checked', 'failed']),
    );
    expect(captureBodies(fetchMock as any)[3]).toMatchObject({ errorCode: 'neram/verify-phone-500' });
  });

  it('a closing tab mid sign-in sends a beacon, without a token', async () => {
    state.signedIn = false;
    mockServer();
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    try {
      render(<LoginModal open phoneOnly apiBaseUrl="https://app.test" />);
      fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
      await screen.findByLabelText('OTP');
      window.dispatchEvent(new Event('pagehide'));

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
      expect(url).toBe('https://app.test/api/auth/capture-phone');
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
      const body = JSON.parse(text);
      expect(body).toMatchObject({ event: 'tab_closed', phoneNumber: '+919876543210' });
      expect(body.idToken).toBeUndefined();
    } finally {
      delete (navigator as any).sendBeacon;
    }
  });
});
