import { describe, it, expect } from 'vitest';
import { buildMeetingHtml } from './teams-meeting-html';

const cls = {
  title: 'Angles < 90 & > 45',
  scheduled_date: '2026-10-10',
  start_time: '19:00',
  end_time: '20:00',
  description: 'Bring a "pencil"\nand paper',
};

describe('buildMeetingHtml', () => {
  it('escapes what the teacher typed', () => {
    const html = buildMeetingHtml(cls, 'https://teams/join?a=1&b=2', undefined, { tutorName: 'Hari <B>' });
    expect(html).toContain('Angles &lt; 90 &amp; &gt; 45');
    expect(html).toContain('Bring a &quot;pencil&quot;<br/>and paper');
    expect(html).toContain('Hari &lt;B&gt;');
    expect(html).toContain('href="https://teams/join?a=1&amp;b=2"');
    expect(html).not.toContain('<B>');
  });

  it('lists watch-before-class videos with their length, linking into Nexus', () => {
    const html = buildMeetingHtml(cls, 'https://teams/join', undefined, {
      prewatch: [
        { title: 'Humans on the street', url: 'https://nexus/student/timetable/c1/watch/r1', durationSeconds: 1500 },
        { title: 'Crowds & scale', url: 'https://nexus/student/timetable/c1/watch/r2' },
      ],
    });
    expect(html).toContain('Watch before class');
    expect(html).toContain('<a href="https://nexus/student/timetable/c1/watch/r1">Humans on the street</a> (25 min)');
    expect(html).toContain('Crowds &amp; scale</a></li>');
  });

  it('says nothing about videos when there are none', () => {
    expect(buildMeetingHtml(cls, 'https://teams/join')).not.toContain('Watch before class');
    expect(buildMeetingHtml(cls, 'https://teams/join', undefined, { prewatch: [] })).not.toContain('Watch before class');
  });

  it('keeps the RSVP line', () => {
    expect(buildMeetingHtml(cls, 'https://teams/join', 'https://nexus/student/rsvp/c1')).toContain(
      '<a href="https://nexus/student/rsvp/c1">Tap to RSVP</a>',
    );
  });
});
