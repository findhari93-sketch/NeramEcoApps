/**
 * The section model decides what a class announcement says. These tests cover
 * the three things most likely to go wrong in production: the upcoming/past
 * split, the IST boundary, and sections that quietly appear with nothing in
 * them.
 */
import { describe, it, expect } from 'vitest';
import {
  buildShareSections,
  resolveClassState,
  safeUrl,
  MAX_ASSIGNMENTS,
  MAX_BULLETS,
  MAX_DESCRIPTION_CHARS,
  type ClassSharePayload,
  type ShareSection,
  type ShareSectionId,
} from './class-share-model';

const BASE = 'https://nexus.neramclasses.com';

function payload(over: Partial<ClassSharePayload> = {}): ClassSharePayload {
  return {
    classId: 'cls-1',
    title: 'Isometric Drawing Basics',
    scheduled_date: '2026-08-14',
    start_time: '19:00',
    end_time: '20:30',
    state: 'upcoming',
    tutorName: 'Ar. Hari Babu',
    description: 'We start from the cube and build up to subtractive forms.',
    summaryBullets: [],
    links: {
      join: 'https://teams.microsoft.com/l/meetup-join/19abc',
      rsvp: `${BASE}/student/rsvp/cls-1`,
      watch: null,
      watchKind: 'none',
      prepTest: null,
      classTest: null,
    },
    prepTest: null,
    classTest: null,
    assignments: [],
    ...over,
  };
}

const ids = (sections: ShareSection[]): ShareSectionId[] => sections.map((s) => s.id);

describe('resolveClassState', () => {
  const cls = { scheduled_date: '2026-08-14', end_time: '20:30', status: 'scheduled' };

  it('is upcoming one minute before the IST end time', () => {
    expect(resolveClassState(cls, Date.parse('2026-08-14T20:29:00+05:30'))).toBe('upcoming');
  });

  it('is past one minute after the IST end time', () => {
    expect(resolveClassState(cls, Date.parse('2026-08-14T20:31:00+05:30'))).toBe('past');
  });

  it('is past when the status says completed, even before the end time', () => {
    // The Teams sync flips this. Trusting it early is correct; trusting it as
    // the ONLY signal is what the time check exists to fix.
    const done = { ...cls, status: 'completed' };
    expect(resolveClassState(done, Date.parse('2026-08-14T19:05:00+05:30'))).toBe('past');
  });

  it('is cancelled regardless of the clock', () => {
    const off = { ...cls, status: 'cancelled' };
    expect(resolveClassState(off, Date.parse('2026-08-14T20:31:00+05:30'))).toBe('cancelled');
    expect(resolveClassState(off, Date.parse('2026-08-14T18:00:00+05:30'))).toBe('cancelled');
  });
});

describe('safeUrl', () => {
  it('keeps http and https', () => {
    expect(safeUrl('https://x.com/a')).toBe('https://x.com/a');
    expect(safeUrl('http://x.com/a')).toBe('http://x.com/a');
  });

  it('drops a javascript: URL', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });

  it('drops a URL carrying a quote or an angle bracket', () => {
    expect(safeUrl('https://x.com/"onmouseover=y')).toBeNull();
    expect(safeUrl('https://x.com/<script>')).toBeNull();
  });

  it('drops empty and relative values', () => {
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('/student/assignments/1')).toBeNull();
  });
});

describe('buildShareSections, upcoming class', () => {
  it('carries join and RSVP, and no recording', () => {
    const s = buildShareSections(payload());
    expect(ids(s)).toContain('join');
    expect(ids(s)).not.toContain('recording');
  });

  it('says "What we will cover", not "What we covered"', () => {
    const s = buildShareSections(payload());
    const desc = s.find((x) => x.id === 'description');
    expect(desc?.heading?.text).toBe('What we will cover');
  });

  it('offers the prep test and calls it "Before you join"', () => {
    const s = buildShareSections(
      payload({
        prepTest: { title: 'Before you join', questionCount: 6, passingPct: 70 },
        links: { ...payload().links, prepTest: `${BASE}/student/class-prep/cls-1/test` },
      }),
    );
    const tests = s.find((x) => x.id === 'tests');
    expect(tests?.heading?.text).toBe('Before you join');
    expect(tests?.lines[0].text).toBe('6 questions, pass at 70%');
  });

  it('lists prework only, never homework set in the class', () => {
    const s = buildShareSections(
      payload({
        assignments: [
          { id: 'a1', title: 'Perspective sheet', timing: 'prework', dueAtIso: null, type: 'drawing', url: `${BASE}/student/assignments/a1` },
          { id: 'a2', title: 'Later work', timing: 'homework', dueAtIso: null, type: 'document', url: `${BASE}/student/assignments/a2` },
        ],
      }),
    );
    const work = s.find((x) => x.id === 'assignments');
    expect(work?.heading?.text).toBe('Work to finish first');
    expect(work?.lines).toHaveLength(1);
    expect(work?.lines[0].text).toContain('Perspective sheet');
    expect(work?.lines[0].text).not.toContain('Later work');
  });

  it('labels prework with no deadline as due before class', () => {
    const s = buildShareSections(
      payload({
        assignments: [
          { id: 'a1', title: 'Sheet', timing: 'prework', dueAtIso: null, type: 'drawing', url: `${BASE}/student/assignments/a1` },
        ],
      }),
    );
    expect(s.find((x) => x.id === 'assignments')?.lines[0].text).toContain('due before class');
  });
});

describe('buildShareSections, past class', () => {
  const pastBase = payload({
    state: 'past',
    summaryBullets: ['Cube in isometric', 'Two worked examples'],
    links: {
      join: 'https://teams.microsoft.com/l/meetup-join/19abc',
      rsvp: `${BASE}/student/rsvp/cls-1`,
      watch: `${BASE}/student/class-recap/rec-9`,
      watchKind: 'recap',
      prepTest: null,
      classTest: `${BASE}/student/catch-up/cls-1/test`,
    },
    classTest: { questionCount: 10, passingPct: 85 },
  });

  it('carries the recording and drops the join link', () => {
    const s = buildShareSections(pastBase);
    expect(ids(s)).toContain('recording');
    expect(ids(s)).not.toContain('join');
  });

  it('says "What we covered" and lists the wrap-up bullets', () => {
    const s = buildShareSections(pastBase);
    const desc = s.find((x) => x.id === 'description');
    expect(desc?.heading?.text).toBe('What we covered');
    expect(desc?.lines.filter((l) => l.bullet)).toHaveLength(2);
  });

  it('calls the recap player a saved-progress link, and the fallback a catch-up page', () => {
    const viaRecap = buildShareSections(pastBase).find((x) => x.id === 'recording');
    expect(viaRecap?.lines[1].text).toContain('Your progress is saved');

    const viaCatchup = buildShareSections({
      ...pastBase,
      links: { ...pastBase.links, watch: `${BASE}/student/timetable/cls-1/catch-up`, watchKind: 'catchup' },
    }).find((x) => x.id === 'recording');
    expect(viaCatchup?.lines[1].text).toContain('catch-up page');
  });

  it('omits the recording section entirely when there is nothing to watch', () => {
    const s = buildShareSections({
      ...pastBase,
      links: { ...pastBase.links, watch: null, watchKind: 'none' },
    });
    expect(ids(s)).not.toContain('recording');
  });

  it('shows both prework and homework, headed "Homework"', () => {
    const s = buildShareSections({
      ...pastBase,
      assignments: [
        { id: 'a1', title: 'Prep sheet', timing: 'prework', dueAtIso: null, type: 'drawing', url: `${BASE}/student/assignments/a1` },
        { id: 'a2', title: 'Cube sheet', timing: 'homework', dueAtIso: '2026-08-18T18:30:00+00:00', type: 'drawing', url: `${BASE}/student/assignments/a2` },
      ],
    });
    const work = s.find((x) => x.id === 'assignments');
    expect(work?.heading?.text).toBe('Homework');
    expect(work?.lines).toHaveLength(2);
    // 18:30 UTC on the 18th is 00:00 IST on the 19th, a Wednesday. The deadline
    // a student reads must be their own midnight, not the stored UTC day.
    expect(work?.lines[1].text).toContain('due Wed, 19 Aug');
  });

  it('uses the class test, not the prep test', () => {
    const s = buildShareSections(pastBase);
    const tests = s.find((x) => x.id === 'tests');
    expect(tests?.heading?.text).toBe('Class test');
    expect(tests?.lines[0].url).toContain('/student/catch-up/cls-1/test');
  });
});

describe('buildShareSections, empty and cancelled', () => {
  it('produces nothing shareable for a cancelled class', () => {
    expect(buildShareSections(payload({ state: 'cancelled' }))).toEqual([]);
  });

  it('omits the description section when there is no description and no bullets', () => {
    const s = buildShareSections(payload({ description: null, summaryBullets: [] }));
    expect(ids(s)).not.toContain('description');
  });

  it('omits the assignments section when nothing is attached', () => {
    expect(ids(buildShareSections(payload()))).not.toContain('assignments');
  });

  it('omits the test section when a test exists but its link does not', () => {
    const s = buildShareSections(payload({ prepTest: { questionCount: 5, passingPct: 70 } }));
    expect(ids(s)).not.toContain('tests');
  });

  it('always keeps a non-toggleable header and footer', () => {
    const s = buildShareSections(payload());
    expect(s[0].id).toBe('header');
    expect(s[0].toggleable).toBe(false);
    expect(s[s.length - 1].id).toBe('footer');
    expect(s[s.length - 1].toggleable).toBe(false);
  });

  it('gives every toggleable section a checkbox label', () => {
    const s = buildShareSections(payload());
    s.filter((x) => x.toggleable).forEach((x) => expect(x.checkboxLabel).toBeTruthy());
  });
});

describe('buildShareSections, clamps', () => {
  it('truncates an over-long description', () => {
    const long = 'x'.repeat(MAX_DESCRIPTION_CHARS + 200);
    const s = buildShareSections(payload({ description: long }));
    const body = s.find((x) => x.id === 'description')!.lines[0].text;
    expect(body.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS + 3);
    expect(body.endsWith('...')).toBe(true);
  });

  it('caps the wrap-up bullets', () => {
    const many = Array.from({ length: 9 }, (_, i) => `Point ${i + 1}`);
    const s = buildShareSections(payload({ state: 'past', summaryBullets: many }));
    const bullets = s.find((x) => x.id === 'description')!.lines.filter((l) => l.bullet);
    expect(bullets).toHaveLength(MAX_BULLETS);
  });

  it('caps the assignment list and says how many were left out', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      id: `a${i}`,
      title: `Sheet ${i}`,
      timing: 'homework' as const,
      dueAtIso: null,
      type: 'drawing' as const,
      url: `${BASE}/student/assignments/a${i}`,
    }));
    const s = buildShareSections(payload({ state: 'past', assignments: many }));
    const lines = s.find((x) => x.id === 'assignments')!.lines;
    expect(lines).toHaveLength(MAX_ASSIGNMENTS + 1);
    expect(lines[lines.length - 1].text).toBe('and 3 more in Nexus');
    expect(lines[lines.length - 1].url).toBeUndefined();
  });

  it('counts every assignment in the checkbox label, not just the shown ones', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      id: `a${i}`,
      title: `Sheet ${i}`,
      timing: 'homework' as const,
      dueAtIso: null,
      type: 'document' as const,
      url: `${BASE}/student/assignments/a${i}`,
    }));
    const s = buildShareSections(payload({ state: 'past', assignments: many }));
    expect(s.find((x) => x.id === 'assignments')!.checkboxLabel).toBe('Assignments (13)');
  });
});

describe('buildShareSections, hostile input', () => {
  it('drops an assignment link that is not http(s)', () => {
    const s = buildShareSections(
      payload({
        state: 'past',
        assignments: [
          { id: 'a1', title: 'Sheet', timing: 'homework', dueAtIso: null, type: 'drawing', url: 'javascript:alert(1)' },
        ],
      }),
    );
    expect(s.find((x) => x.id === 'assignments')!.lines[0].url).toBeUndefined();
  });

  it('drops a join link that is not http(s)', () => {
    const s = buildShareSections(payload({ links: { ...payload().links, join: 'javascript:alert(1)', rsvp: null } }));
    expect(ids(s)).not.toContain('join');
  });
});
