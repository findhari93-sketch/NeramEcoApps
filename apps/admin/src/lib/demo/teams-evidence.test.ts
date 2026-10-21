import { describe, it, expect } from 'vitest';
import { demoRecordingCandidates, guestsWhoJoined, mergeAttendance } from './teams-evidence';

const TENANT = 'neram-tenant';
const opts = { orgTenantId: TENANT, staffEmails: ['hari@neramclasses.com'] };

describe('mergeAttendance', () => {
  it('merges one person across a test run and the real class, and keeps guests first', () => {
    const list = mergeAttendance(
      [
        {
          emailAddress: 'TamilSelvan@neramclasses.com',
          role: 'Organizer',
          totalAttendanceInSeconds: 2700,
          identity: { id: 'o1', displayName: 'Tamil Selvan', tenantId: TENANT },
          attendanceIntervals: [{ joinDateTime: '2026-10-20T04:28:00Z', leaveDateTime: '2026-10-20T05:15:00Z' }],
        },
        {
          role: 'Attendee',
          totalAttendanceInSeconds: 300,
          identity: { id: 'g1', displayName: 'haribabu M', tenantId: null },
          attendanceIntervals: [{ joinDateTime: '2026-10-19T17:20:00Z', leaveDateTime: '2026-10-19T17:25:00Z' }],
        },
        {
          role: 'Attendee',
          totalAttendanceInSeconds: 2280,
          identity: { id: 'g1', displayName: 'haribabu M', tenantId: null },
          attendanceIntervals: [{ joinDateTime: '2026-10-20T04:32:00Z', leaveDateTime: '2026-10-20T05:10:00Z' }],
        },
      ],
      opts,
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      name: 'haribabu M',
      staff: false,
      seconds: 2580,
      firstJoin: '2026-10-19T17:20:00Z',
      lastLeave: '2026-10-20T05:10:00Z',
    });
    expect(list[1]).toMatchObject({ name: 'Tamil Selvan', staff: true });
    expect(list[0].intervals?.map((i) => i.join)).toEqual(['2026-10-19T17:20:00Z', '2026-10-20T04:32:00Z']);
    expect(guestsWhoJoined(list).map((g) => g.name)).toEqual(['haribabu M']);
  });

  it('treats a guest presenter as a guest, and a demo team address as staff', () => {
    const list = mergeAttendance(
      [
        { role: 'Presenter', totalAttendanceInSeconds: 60, identity: { id: 'g2', displayName: 'Parent' } },
        { emailAddress: 'hari@neramclasses.com', role: 'Attendee', totalAttendanceInSeconds: 60, identity: { id: 's1', displayName: 'Hari' } },
      ],
      opts,
    );
    expect(list.find((a) => a.name === 'Parent')?.staff).toBe(false);
    expect(list.find((a) => a.name === 'Hari')?.staff).toBe(true);
  });

  it('finds no guests in an empty or staff-only meeting', () => {
    expect(guestsWhoJoined(null)).toEqual([]);
    expect(guestsWhoJoined(mergeAttendance([{ emailAddress: 'x@neramclasses.com', totalAttendanceInSeconds: 99 }], opts))).toEqual([]);
  });
});

describe('demoRecordingCandidates', () => {
  const item = (name: string, createdDateTime: string, extra: Record<string, unknown> = {}) => ({
    id: name,
    name,
    webUrl: `https://neram-my.sharepoint.com/${name}`,
    createdDateTime,
    size: 1000,
    file: { mimeType: 'video/mp4' },
    parentReference: { driveId: 'drive1' },
    ...extra,
  });

  it('keeps only this demo’s videos, newest first', () => {
    const out = demoRecordingCandidates(
      [
        item('NERAM DEMO · haribabu M (Class 12) · DEMO-JWQ8-20261019_224919-Meeting Recording.mp4', '2026-10-19T17:19:00Z', { video: { duration: 300000 } }),
        item('Neram Demo · haribabu M (Class 12) · DEMO-JWQ8-20261020_100212-Meeting Recording.mp4', '2026-10-20T04:32:00Z'),
        item('Neram Demo · Priya R (Class 12) · DEMO-4K7Q-20261020_160000-Meeting Recording.mp4', '2026-10-20T10:30:00Z'),
        item('DEMO-JWQ8 notes.docx', '2026-10-20T05:00:00Z', { file: { mimeType: 'application/msword' } }),
      ],
      'DEMO-JWQ8',
    );
    expect(out.map((f) => f.createdAt)).toEqual(['2026-10-20T04:32:00Z', '2026-10-19T17:19:00Z']);
    expect(out[1]).toMatchObject({ driveId: 'drive1', durationMs: 300000 });
  });

  it('matches nothing without a ref', () => {
    expect(demoRecordingCandidates([item('x.mp4', '2026-10-20T04:32:00Z')], '')).toEqual([]);
  });
});
