import { describe, it, expect } from 'vitest';
import { parentJoiningLabel, prettyPhone, telHref, waHref } from './format';

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

describe('parent joining label', () => {
  it('reads in the past once the demo has happened', () => {
    expect(parentJoiningLabel('attended')).toBe('A parent joined the demo');
    expect(parentJoiningLabel('no_show')).toBe('A parent was going to join the demo');
  });

  it('reads ahead while the demo is still to come', () => {
    expect(parentJoiningLabel('approved')).toBe('A parent is joining the demo');
    expect(parentJoiningLabel('pending')).toBe('A parent is joining the demo');
  });
});
