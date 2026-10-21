import { describe, it, expect } from 'vitest';
import { classAccountWelcomeHtml, isWhatsAppGroupLink, linkFromStepConfig } from './class-account';

describe('linkFromStepConfig', () => {
  it('reads the url key', () => {
    expect(linkFromStepConfig({ url: 'https://chat.whatsapp.com/AbC123' })).toBe('https://chat.whatsapp.com/AbC123');
  });
  it('reads a link saved as a key, the way prod holds it', () => {
    expect(linkFromStepConfig({ 'https://chat.whatsapp.com/Hwv31V3vbYp2HrHIvvFJEY': '' })).toBe(
      'https://chat.whatsapp.com/Hwv31V3vbYp2HrHIvvFJEY',
    );
  });
  it('is null for anything else', () => {
    expect(linkFromStepConfig({ url: '' })).toBeNull();
    expect(linkFromStepConfig(null)).toBeNull();
    expect(linkFromStepConfig({ url: 'https://wa.me/919999999999' })).toBeNull();
  });
});

describe('isWhatsAppGroupLink', () => {
  it('accepts only group invites', () => {
    expect(isWhatsAppGroupLink('https://chat.whatsapp.com/Hwv31V3vbYp2HrHIvvFJEY')).toBe(true);
    expect(isWhatsAppGroupLink('http://chat.whatsapp.com/abc')).toBe(false);
    expect(isWhatsAppGroupLink('https://chat.whatsapp.com.evil.com/abc')).toBe(false);
  });
});

describe('classAccountWelcomeHtml', () => {
  const html = classAccountWelcomeHtml({ firstName: 'Radhika', upn: 'Radhika_Bhanuprakash@neramclasses.com' });
  it('has the login ID and the setup link, never a password', () => {
    expect(html).toContain('Radhika_Bhanuprakash@neramclasses.com');
    expect(html).toContain('/onboarding');
    expect(html).not.toContain('@123');
  });
  it('has no em dashes or double dashes in the text', () => {
    expect(html.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/\u2014|&mdash;| -- /);
  });
  it('escapes the name', () => {
    expect(classAccountWelcomeHtml({ firstName: '<b>x', upn: 'a@b.c' })).toContain('&lt;b&gt;x');
  });
});

import { guideProgress } from './class-account';

describe('guideProgress', () => {
  it('starts at 0 of 5', () => {
    expect(guideProgress({ ticks: {}, passwordChangedAt: null, nexusFirstLoginAt: null, photoStatus: null }).count).toBe(0);
  });
  it('counts a sign-in as the apps being installed', () => {
    const p = guideProgress({ ticks: { whatsapp: 'x' }, passwordChangedAt: '2026-10-21T05:00:00Z', nexusFirstLoginAt: null, photoStatus: null });
    expect(p.done).toMatchObject({ whatsapp: true, authenticator: true, teams: true, signin: true, nexus: false });
    expect(p.count).toBe(4);
  });
  it('needs a photo for the last step', () => {
    expect(guideProgress({ ticks: {}, passwordChangedAt: null, nexusFirstLoginAt: 'x', photoStatus: 'pending' }).done.nexus).toBe(true);
    expect(guideProgress({ ticks: {}, passwordChangedAt: null, nexusFirstLoginAt: 'x', photoStatus: 'rejected' }).done.nexus).toBe(false);
  });
});
