import { describe, it, expect } from 'vitest';
import {
  buildStaffDigest,
  buildParentNotice,
  clampText,
  TEAMS_TEXT_LIMIT,
  type DigestEvent,
} from './catchup-digest';

function event(over: Partial<DigestEvent> = {}): DigestEvent {
  return {
    kind: 'reason',
    studentId: 's1',
    studentName: 'Hari Heera',
    classId: 'c1',
    classTitle: 'Coordinate Geometry',
    scheduledDate: '2026-07-29',
    reasonCode: 'unwell',
    reasonNote: null,
    reasonSource: 'student',
    caughtUpAt: null,
    dueOn: '2026-08-05',
    ...over,
  };
}

describe('buildStaffDigest', () => {
  it('says nothing when nothing happened', () => {
    // The cron relies on this: an empty digest is worse than no digest, because
    // it teaches people the bell means nothing.
    expect(buildStaffDigest([])).toBeNull();
  });

  it('reads as one sentence for a single reason', () => {
    const d = buildStaffDigest([event()]);
    expect(d).not.toBeNull();
    expect(d!.message).toContain('1 student explained why they missed a class');
    expect(d!.message).not.toContain('students explained');
  });

  it('names the person when there is exactly one', () => {
    const d = buildStaffDigest([event()])!;
    expect(d.message).toContain('Hari Heera');
    expect(d.message).toContain('unwell');
  });

  it('drops the detail once there is more than one, to stay one line', () => {
    const d = buildStaffDigest([event(), event({ studentId: 's2', studentName: 'Anushka' })])!;
    expect(d.message).toContain('2 students explained');
    expect(d.message).not.toContain('Hari Heera');
  });

  it('counts people, not rows', () => {
    // One student who missed three classes is one person to call.
    const d = buildStaffDigest([
      event({ classId: 'a' }),
      event({ classId: 'b' }),
      event({ classId: 'c' }),
    ])!;
    expect(d.message).toContain('1 student explained');
  });

  it('reports both halves when reasons and completions land together', () => {
    const d = buildStaffDigest([
      event(),
      event({ kind: 'completed', studentId: 's2', studentName: 'Anushka', caughtUpAt: '2026-07-31T10:00:00Z' }),
    ])!;
    expect(d.message).toContain('explained');
    expect(d.message).toContain('finished their catch-up');
    expect(d.title).toBe('Catch-up: new reasons and completions');
  });

  it('titles a completions-only day without mentioning reasons', () => {
    const d = buildStaffDigest([
      event({ kind: 'completed', caughtUpAt: '2026-07-31T10:00:00Z' }),
    ])!;
    expect(d.title).toBe('Catch-ups finished');
    expect(d.message).not.toContain('explained');
  });

  it('keeps the Teams line inside the 150 character cap', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      event({ studentId: `s${i}`, studentName: `A very long student name number ${i}` }),
    );
    const d = buildStaffDigest(many)!;
    expect(d.teamsText.length).toBeLessThanOrEqual(TEAMS_TEXT_LIMIT);
  });

  it('uses no em dashes, per the house copy rule', () => {
    const d = buildStaffDigest([
      event(),
      event({ kind: 'completed', studentId: 's2', caughtUpAt: '2026-07-31T10:00:00Z' }),
    ])!;
    expect(d.title).not.toMatch(/[—–]|--/);
    expect(d.message).not.toMatch(/[—–]|--/);
    expect(d.teamsText).not.toMatch(/[—–]|--/);
  });
});

describe('clampText', () => {
  it('leaves a short string alone', () => {
    expect(clampText('short', 20)).toBe('short');
  });

  it('cuts on a word boundary rather than mid-name', () => {
    const out = clampText('Catch-up: Anushka Stalin Prem explained', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('...')).toBe(true);
    expect(out).not.toContain('Stalin Pr');
  });
});

describe('buildParentNotice', () => {
  it('says nothing when no child has anything', () => {
    expect(buildParentNotice([{ childName: 'Hari', events: [] }])).toBeNull();
  });

  it('WITHHOLDS the note a student typed', () => {
    // The rule this whole module exists to enforce. A student writes that note
    // for their teacher; forwarding it home would teach them to write nothing.
    const notice = buildParentNotice([
      {
        childName: 'Hari',
        events: [
          event({
            reasonCode: 'other',
            reasonNote: 'i bunked to play cricket',
            reasonSource: 'student',
          }),
        ],
      },
    ])!;
    expect(notice.plain).not.toContain('cricket');
    expect(notice.plain).toContain('other');
  });

  it('echoes back a note the PARENT gave themselves', () => {
    const notice = buildParentNotice([
      {
        childName: 'Hari',
        events: [
          event({
            reasonCode: 'family',
            reasonNote: 'we had a wedding',
            reasonSource: 'parent',
          }),
        ],
      },
    ])!;
    expect(notice.plain).toContain('we had a wedding');
  });

  it('gives the deadline when the catch-up is still open', () => {
    const notice = buildParentNotice([{ childName: 'Hari', events: [event()] }])!;
    expect(notice.plain).toContain('due by 5 Aug');
  });

  it('says it is done rather than giving a deadline when it is done', () => {
    const notice = buildParentNotice([
      { childName: 'Hari', events: [event({ caughtUpAt: '2026-07-31T10:00:00Z', dueOn: null })] },
    ])!;
    expect(notice.plain).toContain('already done');
    expect(notice.plain).not.toContain('due by');
  });

  it('covers every child in one email', () => {
    const notice = buildParentNotice([
      { childName: 'Hari', events: [event()] },
      { childName: 'Anushka', events: [event({ studentId: 's2' })] },
    ])!;
    expect(notice.plain).toContain('Hari');
    expect(notice.plain).toContain('Anushka');
    expect(notice.subject).toBe('A missed class at Neram Classes');
  });

  it('names the child in the subject when there is only one', () => {
    const notice = buildParentNotice([{ childName: 'Hari', events: [event()] }])!;
    expect(notice.subject).toBe('Hari missed a class');
  });

  it('is honest when no reason has been given', () => {
    const notice = buildParentNotice([
      { childName: 'Hari', events: [event({ reasonCode: null, reasonNote: null })] },
    ])!;
    expect(notice.plain).toContain('No reason has been given yet');
  });

  it('uses no em dashes, per the house copy rule', () => {
    const notice = buildParentNotice([
      { childName: 'Hari', events: [event(), event({ kind: 'completed', caughtUpAt: 'x' })] },
    ])!;
    expect(notice.subject).not.toMatch(/[—–]|--/);
    expect(notice.plain).not.toMatch(/[—–]|--/);
  });
});
