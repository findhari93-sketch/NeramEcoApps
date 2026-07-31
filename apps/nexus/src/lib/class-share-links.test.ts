/**
 * The share message is pasted into a class group, so a wrong path is a link
 * every student taps and none of them can open. These assertions pin the exact
 * routes, including the two that have already been confused in this codebase.
 */
import { describe, it, expect } from 'vitest';
import { classShareLinks } from './class-share-links';

const BASE = 'https://nexus.neramclasses.com';
const L = classShareLinks(BASE);

describe('classShareLinks', () => {
  it('uses the SINGULAR class-recap path', () => {
    // /student/class-recaps is the list page and has no [recapId] child, so the
    // plural 404s. This is the trap the catch-up page comments on.
    expect(L.recap('rec-1')).toBe(`${BASE}/student/class-recap/rec-1`);
    expect(L.recap('rec-1')).not.toContain('/class-recaps/');
  });

  it('keeps the prep test and the catch-up test apart', () => {
    expect(L.prepTest('cls-1')).toBe(`${BASE}/student/class-prep/cls-1/test`);
    expect(L.catchUpTest('cls-1')).toBe(`${BASE}/student/catch-up/cls-1/test`);
    expect(L.prepTest('cls-1')).not.toBe(L.catchUpTest('cls-1'));
  });

  it('sends both assignment types to the one assignment route', () => {
    expect(L.assignment('a-1')).toBe(`${BASE}/student/assignments/a-1`);
  });

  it('builds the catch-up page and the RSVP page', () => {
    expect(L.catchUp('cls-1')).toBe(`${BASE}/student/timetable/cls-1/catch-up`);
    expect(L.rsvp('cls-1')).toBe(`${BASE}/student/rsvp/cls-1`);
  });

  it('opens one class on the timetable by query parameter', () => {
    // There is no /student/timetable/[classId] page. The parameter name is
    // pinned here because the Teams wrap-up card posted this link for months
    // before the page read it, and a rename would break it again silently.
    expect(L.classInTimetable('cls-1')).toBe(`${BASE}/student/timetable?class=cls-1`);
  });

  it('does not double the slash when the base has a trailing one', () => {
    const trailing = classShareLinks('https://nexus.neramclasses.com/');
    expect(trailing.rsvp('cls-1')).toBe(`${BASE}/student/rsvp/cls-1`);
    expect(trailing.rsvp('cls-1')).not.toContain('//student');
  });

  it('produces absolute https links for every builder', () => {
    const all = [
      L.assignment('a'),
      L.prepTest('c'),
      L.catchUpTest('c'),
      L.recap('r'),
      L.catchUp('c'),
      L.rsvp('c'),
      L.classInTimetable('c'),
    ];
    all.forEach((url) => expect(url).toMatch(/^https:\/\//));
  });
});
