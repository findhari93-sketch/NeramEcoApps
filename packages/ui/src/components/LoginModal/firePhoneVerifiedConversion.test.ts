import { afterEach, describe, expect, it, vi } from 'vitest';
import { firePhoneVerifiedConversion } from './LoginModal';

describe('firePhoneVerifiedConversion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as any).gtag;
  });

  it('sends the verified sign-up to Google Ads with our user id', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_ID', 'AW-1');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_PHONE_VERIFIED_LABEL', 'LBL');
    const gtag = vi.fn();
    (window as any).gtag = gtag;
    firePhoneVerifiedConversion('user-1');
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', { send_to: 'AW-1/LBL', transaction_id: 'user-1' });
  });

  it('stays quiet without the label (staging, local) or without the tag', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_ID', 'AW-1');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_PHONE_VERIFIED_LABEL', '');
    const gtag = vi.fn();
    (window as any).gtag = gtag;
    firePhoneVerifiedConversion('user-1');
    expect(gtag).not.toHaveBeenCalled();

    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_PHONE_VERIFIED_LABEL', 'LBL');
    delete (window as any).gtag;
    expect(() => firePhoneVerifiedConversion('user-1')).not.toThrow();
  });

  it('never lets a broken tag break sign-in', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_ID', 'AW-1');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_PHONE_VERIFIED_LABEL', 'LBL');
    (window as any).gtag = () => {
      throw new Error('blocked');
    };
    expect(() => firePhoneVerifiedConversion(undefined)).not.toThrow();
  });
});
