// @vitest-environment-options {"url":"https://neramclasses.com/apply"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canTrack, isProdHost, isTrackableBuild } from './env';
import { fireOnce, toE164, trackApplicationSubmitted, trackSignupVerified } from './conversions';
import { buildGoogleTagScript } from './GoogleTag';
import { fireSignupConversion } from '../components/LoginModal/LoginModal';

function stubProdEnv() {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_ID', 'AW-1');
  vi.stubEnv('NEXT_PUBLIC_GADS_LABEL_SIGNUP', 'SIGNUP');
  vi.stubEnv('NEXT_PUBLIC_GADS_LABEL_APPLICATION', 'APP');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
}

describe('analytics env gates', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('knows the production hostnames and nothing else', () => {
    expect(isProdHost('neramclasses.com')).toBe(true);
    expect(isProdHost('www.neramclasses.com')).toBe(true);
    expect(isProdHost('app.neramclasses.com')).toBe(true);
    for (const host of ['staging.neramclasses.com', 'staging-app.neramclasses.com', 'neram-marketing-abc.vercel.app', 'localhost']) {
      expect(isProdHost(host)).toBe(false);
    }
  });

  it('tracks only production builds, or builds that do not say', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    expect(isTrackableBuild()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(isTrackableBuild()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    expect(isTrackableBuild()).toBe(true);
  });

  it('needs the Ads id and a production build on a production host', () => {
    stubProdEnv();
    expect(canTrack()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_ID', '');
    expect(canTrack()).toBe(false);
    stubProdEnv();
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    expect(canTrack()).toBe(false);
  });
});

describe('toE164 and fireOnce', () => {
  beforeEach(() => window.localStorage.clear());

  it('normalises phone numbers to E.164', () => {
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
    expect(toE164('9876543210')).toBe('+919876543210');
    expect(toE164('971501234567')).toBe('+971501234567');
  });

  it('runs once per key in this browser', () => {
    const fn = vi.fn();
    fireOnce('k', fn);
    fireOnce('k', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('still runs when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const fn = vi.fn();
    expect(() => fireOnce('k2', fn)).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    get.mockRestore();
    set.mockRestore();
  });
});

describe('conversions', () => {
  let gtag: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    window.localStorage.clear();
    stubProdEnv();
    gtag = vi.fn();
    (window as any).gtag = gtag;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as any).gtag;
  });

  it('sends the sign-up once, with value, transaction id and enhanced conversion data', () => {
    trackSignupVerified({ userId: 'u1', phone: '+919876543210', email: ' A@B.com ' });
    trackSignupVerified({ userId: 'u1', phone: '+919876543210' });
    expect(gtag).toHaveBeenCalledWith('set', 'user_data', { phone_number: '+919876543210', email: 'a@b.com' });
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-1/SIGNUP',
      value: 100,
      currency: 'INR',
      transaction_id: 'signup_u1',
    });
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'phone_otp' });
    expect(gtag.mock.calls.filter((c) => c[1] === 'conversion')).toHaveLength(1);
  });

  it('sends the application once per application', () => {
    trackApplicationSubmitted({ applicationId: 'a1', phone: '9876543210' });
    trackApplicationSubmitted({ applicationId: 'a1', phone: '9876543210' });
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-1/APP',
      value: 500,
      currency: 'INR',
      transaction_id: 'app_a1',
    });
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', { value: 500, currency: 'INR' });
    expect(gtag.mock.calls.filter((c) => c[1] === 'conversion')).toHaveLength(1);
  });

  it('stays quiet without a label or on a preview build', () => {
    vi.stubEnv('NEXT_PUBLIC_GADS_LABEL_SIGNUP', '');
    trackSignupVerified({ userId: 'u2', phone: '+919876543210' });
    vi.stubEnv('NEXT_PUBLIC_GADS_LABEL_SIGNUP', 'SIGNUP');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    trackSignupVerified({ userId: 'u3', phone: '+919876543210' });
    expect(gtag).not.toHaveBeenCalled();
  });

  it('never throws when the tag is broken', () => {
    (window as any).gtag = () => {
      throw new Error('blocked');
    };
    expect(() => trackSignupVerified({ userId: 'u4', phone: '+919876543210' })).not.toThrow();
    expect(() => trackApplicationSubmitted({ applicationId: 'a4' })).not.toThrow();
  });

  it('LoginModal fires the sign-up only when the server says it is the first verification', () => {
    fireSignupConversion({ signupConversion: false, user: { id: 'u5' } }, '+919876543210');
    fireSignupConversion({ user: { id: 'u5' } }, '+919876543210');
    fireSignupConversion(undefined, '+919876543210');
    expect(gtag).not.toHaveBeenCalled();
    fireSignupConversion({ signupConversion: true, user: { id: 'u5', phone: '+919876543210' } }, '+919876543210');
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', expect.objectContaining({ transaction_id: 'signup_u5' }));
  });
});

describe('buildGoogleTagScript', () => {
  function run(hostname: string, opts: { ga4Id?: string; callLabel?: string } = {}) {
    const script = buildGoogleTagScript({ adsId: 'AW-1', ...opts });
    const appended: Array<{ src: string }> = [];
    const listeners: Array<(e: unknown) => void> = [];
    const fakeWindow: Record<string, unknown> = {};
    const fakeDocument = {
      createElement: () => ({ async: false, src: '' }),
      head: { appendChild: (el: { src: string }) => appended.push(el) },
      addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
    };
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'location', `var dataLayer; ${script.replace('window.dataLayer = window.dataLayer || [];', 'dataLayer = window.dataLayer = window.dataLayer || [];')}`)(
      fakeWindow,
      fakeDocument,
      { hostname },
    );
    const dataLayer = fakeWindow.dataLayer as IArguments[];
    const calls = dataLayer.map((a) => Array.from(a));
    const callsNow = () => dataLayer.map((a) => Array.from(a));
    return { appended, listeners, calls, callsNow };
  }

  it('loads gtag.js and configures Ads with enhanced conversions on production', () => {
    const { appended, calls } = run('neramclasses.com', { ga4Id: 'G-1' });
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain('googletagmanager.com/gtag/js?id=AW-1');
    expect(calls).toContainEqual(['config', 'AW-1', { allow_enhanced_conversions: true }]);
    expect(calls).toContainEqual(['config', 'G-1']);
  });

  it('loads nothing on previews, staging or localhost', () => {
    for (const host of ['neram-marketing-abc.vercel.app', 'staging.neramclasses.com', 'localhost']) {
      const { appended, calls, listeners } = run(host, { callLabel: 'CALL' });
      expect(appended).toHaveLength(0);
      expect(calls).toHaveLength(0);
      expect(listeners).toHaveLength(0);
    }
  });

  it('keeps the phone-call conversion on tel: links', () => {
    const { calls, listeners, callsNow } = run('app.neramclasses.com', { callLabel: 'CALL' });
    expect(calls).toContainEqual(['config', 'AW-1/CALL', { phone_conversion_number: '+919176137043' }]);
    listeners[0]({ target: { closest: () => null } });
    expect(callsNow().filter((c) => c[1] === 'conversion')).toHaveLength(0);
    listeners[0]({ target: { closest: () => ({}) } });
    expect(callsNow()).toContainEqual(['event', 'conversion', { send_to: 'AW-1/CALL' }]);
  });
});
