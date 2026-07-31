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
import { buildCancelledHtml, buildRescheduledHtml, buildWrapUpHtml } from './teams-class-announcements';

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

describe('buildWrapUpHtml', () => {
  const wrapped = {
    title: 'Isometric Subtractive Cubes',
    scheduled_date: '2026-07-22',
    description: 'This class taught how to draw 3D forms by subtracting parts from a basic isometric cube.',
    summary_bullets: ['Isometric vs perspective', 'Building the base cube', 'Carving out the notch'],
  };

  it('carries the real topic, the brief and the points', () => {
    const html = buildWrapUpHtml(wrapped);
    expect(html).toContain('Isometric Subtractive Cubes');
    expect(html).toContain('subtracting parts');
    expect(html).toContain('Carving out the notch');
    expect(html).toContain('What we did');
  });

  it('says what happened, never what was planned', () => {
    // The whole point of the card: a student reading it three weeks later wants
    // the account, not a diff against an intention.
    expect(buildWrapUpHtml(wrapped)).not.toMatch(/planned|instead of|originally/i);
  });

  it('caps the point list at six so the card stays readable in a channel', () => {
    const many = { ...wrapped, summary_bullets: Array.from({ length: 12 }, (_, i) => `Point ${i + 1}`) };
    const html = buildWrapUpHtml(many);
    expect(html).toContain('Point 6');
    expect(html).not.toContain('Point 7');
  });

  it('escapes angle brackets and ampersands in a teacher-typed title', () => {
    // "Angles < 90 & > 45" rendered as garbage in Teams before esc() existed:
    // Graph accepts the malformed markup and does its best with it.
    const html = buildWrapUpHtml({ ...wrapped, title: 'Angles < 90 & > 45' });
    expect(html).toContain('Angles &lt; 90 &amp; &gt; 45');
    expect(html).not.toContain('< 90');
  });

  it('links back to Nexus for the full note only when given a url', () => {
    expect(buildWrapUpHtml(wrapped, 'https://nexus.neramclasses.com/x')).toContain(
      'https://nexus.neramclasses.com/x',
    );
    expect(buildWrapUpHtml(wrapped)).not.toContain('href');
  });

  it('renders a class with no brief and no bullets without leaving empty markup', () => {
    const html = buildWrapUpHtml({ title: 'Just a title', scheduled_date: '2026-07-22' });
    expect(html).toContain('Just a title');
    expect(html).not.toContain('<ul>');
    expect(html).not.toContain('<p></p>');
  });

  it('never contains an em dash or a double dash', () => {
    const html = buildWrapUpHtml(wrapped, 'https://x');
    expect(html).not.toContain('—');
    expect(html).not.toContain('--');
    expect(html).not.toContain('&mdash;');
  });
});
