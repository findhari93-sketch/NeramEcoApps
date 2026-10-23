import { describe, it, expect } from 'vitest';
import { prettyPhone, telHref, waHref } from './format';

describe('demo desk phone links', () => {
  it('shows, calls and messages an Indian number as before', () => {
    expect(prettyPhone('9500732502')).toBe('+91 95007 32502');
    expect(telHref('9500732502')).toBe('tel:+919500732502');
    expect(waHref('9500732502')).toBe('https://wa.me/919500732502');
  });

  it('keeps a Gulf number on its own code, never +91', () => {
    expect(prettyPhone('+971551993240')).toBe('+971 551993240');
    expect(telHref('+971551993240')).toBe('tel:+971551993240');
    expect(waHref('+971551993240', 'Hi')).toBe('https://wa.me/971551993240?text=Hi');
  });
});
