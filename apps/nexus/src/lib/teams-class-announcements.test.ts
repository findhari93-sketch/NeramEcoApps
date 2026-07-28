/**
 * Unit tests for the Teams announcement card bodies.
 *
 * These strings are read by students inside Teams, so they carry the same rules
 * as any other user-visible copy: no em dashes, and they must say plainly what
 * happened. The reschedule card in particular has to show BOTH the new time and
 * the old one, because a student scrolling the channel sees two cards and has to
 * be able to tell which one is current without opening Nexus.
 */
import { describe, it, expect } from 'vitest';
import { buildCancelledHtml, buildRescheduledHtml } from './teams-class-announcements';

const cls = {
  title: 'Isometric Drawing Basics',
  scheduled_date: '2026-07-29',
  start_time: '19:00',
  end_time: '20:30',
};

const was = { scheduled_date: '2026-07-28', start_time: '19:00' };

describe('buildRescheduledHtml', () => {
  it('shows the new slot and the old slot', () => {
    const html = buildRescheduledHtml(cls, was);
    expect(html).toContain('2026-07-29');
    expect(html).toContain('19:00 to 20:30');
    expect(html).toContain('2026-07-28');
    expect(html).toContain('Was:');
    expect(html).toContain('Now:');
  });

  it('names the class', () => {
    expect(buildRescheduledHtml(cls, was)).toContain('Isometric Drawing Basics');
  });

  it('keeps the join link, because the meeting itself did not change', () => {
    const html = buildRescheduledHtml(cls, was, 'https://teams.microsoft.com/l/meet/123');
    expect(html).toContain('https://teams.microsoft.com/l/meet/123');
    expect(html).toContain('Join Meeting');
  });

  it('omits the join line when there is no meeting', () => {
    const html = buildRescheduledHtml(cls, was);
    expect(html).not.toContain('Join Meeting');
  });

  it('offers RSVP against the new time when a link is given', () => {
    const html = buildRescheduledHtml(cls, was, null, 'https://nexus.neramclasses.com/student/rsvp/abc');
    expect(html).toContain('https://nexus.neramclasses.com/student/rsvp/abc');
    expect(html).toContain('new time');
  });

  it('omits the RSVP line when there is no link', () => {
    expect(buildRescheduledHtml(cls, was)).not.toContain('RSVP');
  });

  it('never contains an em dash or a double dash', () => {
    const html = buildRescheduledHtml(cls, was, 'https://x', 'https://y');
    expect(html).not.toContain('—');
    expect(html).not.toContain('--');
    expect(html).not.toContain('&mdash;');
  });
});

describe('buildCancelledHtml', () => {
  it('says the class is cancelled and carries no join link', () => {
    const html = buildCancelledHtml(cls);
    expect(html).toContain('Cancelled');
    expect(html).toContain('Isometric Drawing Basics');
    expect(html).not.toContain('Join Meeting');
  });

  it('never contains an em dash', () => {
    expect(buildCancelledHtml(cls)).not.toContain('—');
  });
});
