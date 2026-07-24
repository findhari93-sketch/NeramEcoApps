/**
 * Unit tests for the WhatsApp announcement builder. This text is pasted into a
 * student group, so it must format IST times correctly, drop optional pieces
 * cleanly, and never contain an em dash (repo content rule).
 */
import { describe, it, expect } from 'vitest';
import { buildClassWhatsAppMessage } from './class-share-message';

const base = {
  title: 'Isometric Drawing Basics',
  scheduled_date: '2026-07-24',
  start_time: '19:00',
  end_time: '20:30',
};

describe('buildClassWhatsAppMessage', () => {
  it('includes title, 12-hour IST times and the join link', () => {
    const msg = buildClassWhatsAppMessage({ ...base, joinUrl: 'https://teams.microsoft.com/l/meet/123' });
    expect(msg).toContain('Isometric Drawing Basics');
    expect(msg).toContain('7:00 PM to 8:30 PM (IST)');
    expect(msg).toContain('https://teams.microsoft.com/l/meet/123');
  });

  it('omits the join line when there is no URL', () => {
    const msg = buildClassWhatsAppMessage(base);
    expect(msg).not.toContain('Join on Teams');
  });

  it('includes the description when present', () => {
    const msg = buildClassWhatsAppMessage({ ...base, description: 'Bring a ruler and pencil.' });
    expect(msg).toContain('Bring a ruler and pencil.');
  });

  it('handles times with seconds', () => {
    const msg = buildClassWhatsAppMessage({ ...base, start_time: '09:30:00', end_time: '11:00:00' });
    expect(msg).toContain('9:30 AM to 11:00 AM (IST)');
  });

  it('never contains an em dash', () => {
    const msg = buildClassWhatsAppMessage({ ...base, joinUrl: 'https://x', description: 'a\nb' });
    expect(msg).not.toContain('—');
  });
});
