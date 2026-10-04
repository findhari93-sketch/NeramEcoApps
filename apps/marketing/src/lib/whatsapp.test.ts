import { describe, it, expect } from 'vitest';
import { buildWhatsAppLink, pageCode } from './whatsapp';

describe('buildWhatsAppLink', () => {
  it('uses the main number and names the city with a page code', () => {
    const { href, pageCode: code } = buildWhatsAppLink({ city: 'Madurai', citySlug: 'madurai' });
    expect(code).toBe('EN-MDU');
    expect(href.startsWith('https://wa.me/919176137043?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toBe("Hi Neram, I'm from Madurai. I'd like to know about NATA coaching. [EN-MDU]");
  });

  it('writes the message in the visitor language', () => {
    const { href } = buildWhatsAppLink({ lang: 'ta', city: 'சென்னை', citySlug: 'chennai' });
    expect(decodeURIComponent(href.split('text=')[1])).toContain('[TA-CHN]');
    expect(decodeURIComponent(href.split('text=')[1])).toContain('வணக்கம்');
  });

  it('keeps a custom message but still tags the page', () => {
    const { href } = buildWhatsAppLink({ text: 'I have a question about the scholarship.' });
    expect(decodeURIComponent(href.split('text=')[1])).toBe('I have a question about the scholarship. [EN-WEB]');
  });

  it('derives a code for cities without a fixed one', () => {
    expect(pageCode('en', 'jaipur')).toBe('EN-JAI');
    expect(pageCode('kn', 'bangalore')).toBe('KN-BLR');
  });
});
