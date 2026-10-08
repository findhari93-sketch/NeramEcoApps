import { describe, it, expect } from 'vitest';
import { buildDemoEventPayload, graphUtc, overlapping, DEMO_CATEGORY } from './teams';

describe('graphUtc', () => {
  it('reads getSchedule times (no Z, seven decimals) as UTC', () => {
    expect(graphUtc('2025-10-14T12:30:00.0000000')).toBe('2025-10-14T12:30:00.000Z');
    expect(graphUtc('2025-10-14T12:30:00')).toBe('2025-10-14T12:30:00.000Z');
  });
});

describe('overlapping', () => {
  const blocks = [
    { start: '2025-10-14T12:00:00.000Z', end: '2025-10-14T13:00:00.000Z', status: 'busy' },
    { start: '2025-10-14T14:00:00.000Z', end: '2025-10-14T15:00:00.000Z', status: 'tentative' },
  ];
  it('finds a clash and ignores touching edges', () => {
    expect(overlapping(blocks, new Date('2025-10-14T12:30:00Z'), 45)).toHaveLength(1);
    expect(overlapping(blocks, new Date('2025-10-14T13:00:00Z'), 60)).toHaveLength(0);
  });
});

describe('buildDemoEventPayload', () => {
  it('is a Teams event in UTC, tagged Neram Demo, with every attendee', () => {
    const p = buildDemoEventPayload({
      organizerUpn: 'a@x',
      subject: 'NERAM DEMO',
      bodyHtml: '<p>x</p>',
      start: new Date('2025-10-14T12:30:00Z'),
      minutes: 45,
      attendees: [
        { email: 's@gmail.com', name: 'S' },
        { email: 'b@x', name: 'B' },
      ],
    });
    expect(p.isOnlineMeeting).toBe(true);
    expect(p.categories).toEqual([DEMO_CATEGORY]);
    expect(p.start).toEqual({ dateTime: '2025-10-14T12:30:00.000', timeZone: 'UTC' });
    expect(p.end.dateTime).toBe('2025-10-14T13:15:00.000');
    expect(p.attendees.map((a) => a.emailAddress.address)).toEqual(['s@gmail.com', 'b@x']);
  });
});
