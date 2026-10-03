import { describe, expect, it } from 'vitest';
import { buildBrief, type BriefFacts } from './brief';

const base: BriefFacts = {
  firstName: 'Priya',
  today: '2026-10-03',
  classroomName: 'JEE B.Arch Session 1',
  nextClass: null,
  assignments: { pending: 0, nextTitle: null, nextDueOn: null },
  catchup: null,
  reviewsBack: 0,
  sketchbookLine: null,
  exam: null,
  remindersToday: [],
};

describe('buildBrief', () => {
  it('greets by the hour and says when there is nothing to report', () => {
    const b = buildBrief(base, 9);
    expect(b.greeting).toBe('Good morning, Priya');
    expect(b.hasContent).toBe(false);
    expect(b.sections).toEqual([]);
    expect(buildBrief(base, 14).greeting).toBe('Good afternoon, Priya');
    expect(buildBrief(base, 19).greeting).toBe('Good evening, Priya');
    expect(buildBrief({ ...base, firstName: null }, 19).greeting).toBe('Good evening');
  });

  it('describes the next class today and tomorrow, and a declined one', () => {
    const today = buildBrief({ ...base, nextClass: { id: 'k1', title: 'Perspective', date: '2026-10-03', startTime: '18:00', endTime: '19:30', declined: false } }, 9);
    expect(today.sections[0]).toEqual({ id: 'next_class', text: 'Class today at 6:00 pm: Perspective.', link: '/student/timetable' });
    const declined = buildBrief({ ...base, nextClass: { id: 'k1', title: 'Perspective', date: '2026-10-04', startTime: '18:00', endTime: '19:30', declined: true } }, 9);
    expect(declined.sections[0].text).toBe('Class tomorrow at 6:00 pm: Perspective. You said you cannot attend.');
  });

  it('counts assignments and names the nearest due date', () => {
    const b = buildBrief({ ...base, assignments: { pending: 2, nextTitle: 'Shading sheet', nextDueOn: '2026-10-05' } }, 9);
    expect(b.sections[0]).toEqual({ id: 'assignments', text: '2 assignments to submit. Shading sheet is due Monday 5 Oct.', link: '/student/assignments' });
    const one = buildBrief({ ...base, assignments: { pending: 1, nextTitle: 'Shading sheet', nextDueOn: null } }, 9);
    expect(one.sections[0].text).toBe('1 assignment to submit: Shading sheet.');
  });

  it('passes the catch-up sentence through and counts reviews back', () => {
    const b = buildBrief({ ...base, catchup: { open: 1, sentence: 'You are on track. Keep going at 2 classes a week and you will be level with the class.' }, reviewsBack: 2 }, 9);
    expect(b.sections.map((s) => s.id)).toEqual(['catchup', 'reviews']);
    expect(b.sections[0].link).toBe('/student/catch-up');
    expect(b.sections[1].text).toBe('2 drawings came back with a review this week.');
    expect(buildBrief({ ...base, reviewsBack: 1 }, 9).sections[0].text).toBe('1 drawing came back with a review this week.');
  });

  it('adds the sketchbook line, the exam countdown and reminders due today, in that order', () => {
    const b = buildBrief({
      ...base,
      sketchbookLine: '1 of 3 days this week.',
      exam: { shortLabel: 'NATA', headline: 'About 4 months to go', detail: '14 Feb, date confirmed' },
      remindersToday: ['finish the catch-up', 'bring the sketchbook'],
    }, 9);
    expect(b.sections.map((s) => s.id)).toEqual(['sketchbook', 'exam', 'reminders']);
    expect(b.sections[0]).toEqual({ id: 'sketchbook', text: 'Sketchbook: 1 of 3 days this week.', link: '/student/sketchbook' });
    expect(b.sections[1].text).toBe('NATA: About 4 months to go. 14 Feb, date confirmed.');
    expect(b.sections[2]).toEqual({ id: 'reminders', text: 'You asked me to remind you today: finish the catch-up; bring the sketchbook.', link: null });
    expect(b.hasContent).toBe(true);
  });

  it('never contains an em dash', () => {
    const b = buildBrief({ ...base, assignments: { pending: 3, nextTitle: 'A', nextDueOn: '2026-10-04' }, reviewsBack: 1 }, 9);
    for (const s of b.sections) expect(s.text).not.toMatch(/—|--/);
  });
});
