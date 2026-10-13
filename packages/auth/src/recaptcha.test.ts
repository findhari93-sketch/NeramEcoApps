import { describe, it, expect, vi, beforeEach } from 'vitest';

// RecaptchaVerifier records the element it was handed; the real one would load
// Google's script. firebase/app and getAuth are stubbed so nothing initialises.
const verifiers: Array<{ target: unknown; clear: ReturnType<typeof vi.fn> }> = [];

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({ settings: {} })),
    setPersistence: vi.fn(() => Promise.resolve()),
    RecaptchaVerifier: vi.fn(function (this: any, _auth: unknown, target: unknown) {
      this.target = target;
      this.clear = vi.fn();
      verifiers.push(this);
    }),
  };
});

import { initRecaptcha, clearRecaptcha } from './firebase';

describe('initRecaptcha', () => {
  beforeEach(() => {
    clearRecaptcha();
    verifiers.length = 0;
    document.body.innerHTML = '<div id="recaptcha-container-login-modal"></div>';
  });

  it('gives every verifier a fresh element inside the container', () => {
    const container = document.getElementById('recaptcha-container-login-modal')!;

    initRecaptcha('recaptcha-container-login-modal');
    initRecaptcha('recaptcha-container-login-modal');

    const [first, second] = verifiers;
    expect(first.target).toBeInstanceOf(HTMLElement);
    expect(second.target).toBeInstanceOf(HTMLElement);
    // grecaptcha refuses to render twice in one element ("Change number", Resend).
    expect(second.target).not.toBe(first.target);
    expect(second.target).not.toBe(container);
    expect((second.target as HTMLElement).parentElement).toBe(container);
  });

  it('keeps only the latest element in the container and clears the old verifier', () => {
    const container = document.getElementById('recaptcha-container-login-modal')!;

    initRecaptcha('recaptcha-container-login-modal');
    initRecaptcha('recaptcha-container-login-modal');

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(verifiers[1].target);
    expect(verifiers[0].clear).toHaveBeenCalledTimes(1);
  });

  it('passes the id through when the container is missing, so Firebase raises its own error', () => {
    initRecaptcha('no-such-container');
    expect(verifiers[0].target).toBe('no-such-container');
  });
});
