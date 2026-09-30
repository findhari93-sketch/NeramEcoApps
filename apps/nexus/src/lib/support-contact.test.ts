import { describe, expect, it } from 'vitest';
import {
  HELP_PROBLEMS,
  SUPPORT_PHONE,
  buildWhatsAppHelpLink,
  buildWhatsAppHelpMessage,
  describeDevice,
  normalizePhone,
  safeReturnPath,
  whatsAppLink,
} from './support-contact';

const PIXEL_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';

describe('normalizePhone', () => {
  it('reads a bare 10 digit number as Indian', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
  });

  it('keeps a number that already has a country code', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('+971501234567')).toBe('+971501234567');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
  });

  it('drops a leading trunk zero', () => {
    expect(normalizePhone('09876543210')).toBe('+919876543210');
  });

  it('refuses things that cannot be a phone number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('+12')).toBeNull();
  });
});

describe('whatsAppLink', () => {
  it('uses digits only in the path and encodes the text', () => {
    expect(whatsAppLink('+91 98765 43210')).toBe('https://wa.me/919876543210');
    expect(whatsAppLink(SUPPORT_PHONE, 'Hi & bye')).toBe('https://wa.me/919176137043?text=Hi%20%26%20bye');
  });
});

describe('describeDevice', () => {
  it('names an Android phone running the installed app', () => {
    expect(describeDevice({ userAgent: PIXEL_CHROME, installed: true })).toBe('Android 14 phone, Chrome 129, installed app');
  });

  it('names an iPhone in the browser', () => {
    expect(describeDevice({ userAgent: IPHONE_SAFARI, installed: false })).toBe('iOS 17 phone, Safari 17, browser');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(describeDevice({ userAgent: WINDOWS_EDGE, installed: false })).toBe('Windows computer, Edge 129, browser');
  });

  it('still says something for an unknown agent', () => {
    expect(describeDevice({ userAgent: '', installed: false })).toBe('browser');
  });
});

describe('buildWhatsAppHelpMessage', () => {
  const at = new Date('2026-09-30T13:26:00Z'); // 6:56 pm in India

  it('carries the problem, India time, device and version, and leaves the name for the student', () => {
    const text = buildWhatsAppHelpMessage({ problem: 'cant_open', device: 'Android 14 phone, Chrome 129, installed app', at, appVersion: 'abc123' });
    expect(text).toContain("Problem: Can't open the app");
    expect(text).toMatch(/When: 30 Sept?, 6:56\s?pm/i);
    expect(text).toContain('Device: Android 14 phone');
    expect(text).toContain('App version: abc123');
    expect(text).toContain('My name: ');
  });

  it('builds a link to the office number', () => {
    const link = buildWhatsAppHelpLink({ problem: 'other', device: 'browser', at });
    expect(link.startsWith('https://wa.me/919176137043?text=')).toBe(true);
    expect(link).not.toContain('App%20version');
  });

  it('never uses em dashes or double dashes in anything a student reads', () => {
    const text = buildWhatsAppHelpMessage({ problem: 'page_error', device: 'browser', at, appVersion: 'x' });
    const labels = HELP_PROBLEMS.map((p) => p.label).join(' ');
    for (const copy of [text, labels]) {
      expect(copy).not.toMatch(/—|--/);
    }
  });
});

describe('safeReturnPath', () => {
  it('keeps a path inside Nexus', () => {
    expect(safeReturnPath('/student/dashboard')).toBe('/student/dashboard');
  });

  it('falls back for anything that could leave the site or loop', () => {
    expect(safeReturnPath(null)).toBe('/login');
    expect(safeReturnPath('https://evil.example')).toBe('/login');
    expect(safeReturnPath('//evil.example')).toBe('/login');
    expect(safeReturnPath('/\\evil.example')).toBe('/login');
    expect(safeReturnPath('/help?from=/x')).toBe('/login');
    expect(safeReturnPath('/offline', '/')).toBe('/');
  });
});
