import { describe, it, expect } from 'vitest';
import { chromeIntentUrl, detectDevice, isInAppBrowser, otherStoreLinks, storeLinkFor } from './device';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const ANDROID_WHATSAPP =
  'Mozilla/5.0 (Linux; Android 13; SM-A146B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 WhatsApp/2.24';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('detectDevice', () => {
  it('tells phones and laptops apart', () => {
    expect(detectDevice(ANDROID_CHROME)).toBe('android');
    expect(detectDevice(IPHONE)).toBe('ios');
    expect(detectDevice(WINDOWS)).toBe('windows');
    expect(detectDevice(MAC)).toBe('mac');
    expect(detectDevice('')).toBe('other');
  });
  it('treats an iPad that says Mac as iOS', () => {
    expect(detectDevice(MAC, 5)).toBe('ios');
  });
});

describe('isInAppBrowser', () => {
  it('spots WhatsApp and Android webviews', () => {
    expect(isInAppBrowser(ANDROID_WHATSAPP)).toBe(true);
    expect(isInAppBrowser(ANDROID_CHROME)).toBe(false);
    expect(isInAppBrowser(IPHONE)).toBe(false);
  });
});

describe('store links', () => {
  it('gives one button per device', () => {
    expect(storeLinkFor('authenticator', 'android')?.href).toContain('com.azure.authenticator');
    expect(storeLinkFor('teams', 'ios')?.href).toContain('apps.apple.com');
    expect(storeLinkFor('teams', 'windows')?.href).toContain('microsoft.com');
  });
  it('has no laptop Authenticator', () => {
    expect(storeLinkFor('authenticator', 'windows')).toBeNull();
  });
  it('lists the other places without repeats', () => {
    const others = otherStoreLinks('teams', 'android').map((l) => l.device);
    expect(others).toEqual(['ios', 'windows', 'mac']);
  });
});

describe('chromeIntentUrl', () => {
  it('opens the same page in Chrome', () => {
    const url = chromeIntentUrl('https://app.neramclasses.com/onboarding?x=1');
    expect(url.startsWith('intent://app.neramclasses.com/onboarding?x=1#Intent;scheme=https;package=com.android.chrome;')).toBe(true);
  });
});
