import { describe, it, expect } from 'vitest';
import { resolveFlags } from './feature-flags';
import { HUB_PATH, activeHubTab, hubHref, hubTabs, visibleHubTabs } from './drawings-hub';

describe('drawings hub tabs', () => {
  it('gives a teacher Flip through, Class rhythm and Inspiration, in that order', () => {
    expect(hubTabs('teacher').map((t) => t.key)).toEqual(['flip', 'rhythm', 'inspiration']);
  });

  it('gives a student their sketchbook and Inspiration', () => {
    expect(hubTabs('student').map((t) => t.key)).toEqual(['mine', 'inspiration']);
  });

  it('marks only Inspiration as a tab that owns its own route', () => {
    for (const role of ['teacher', 'student'] as const) {
      const owning = hubTabs(role).filter((t) => t.href).map((t) => t.key);
      expect(owning, role).toEqual(['inspiration']);
    }
  });

  it('leaves the first tab paramless, so the hub path itself opens it', () => {
    expect(hubHref('teacher', 'flip')).toBe('/teacher/sketchbook');
    expect(hubHref('student', 'mine')).toBe('/student/sketchbook');
  });

  it('switches an in-page tab with ?view=, and links out to the route Inspiration owns', () => {
    expect(hubHref('teacher', 'rhythm')).toBe('/teacher/sketchbook?view=rhythm');
    expect(hubHref('teacher', 'inspiration')).toBe('/teacher/inspiration');
    expect(hubHref('student', 'inspiration')).toBe('/student/inspiration');
  });

  it('every href a tab advertises is one activeHubTab can read back', () => {
    for (const role of ['teacher', 'student'] as const) {
      for (const tab of hubTabs(role)) {
        const href = hubHref(role, tab.key);
        const [pathname, search] = href.split('?');
        expect(activeHubTab(role, pathname, search ? `?${search}` : ''), href).toBe(tab.key);
      }
    }
  });
});

describe('drawings hub: which tab a URL is showing', () => {
  it('reads the hub path with no query as the first tab', () => {
    expect(activeHubTab('teacher', HUB_PATH.teacher, '')).toBe('flip');
    expect(activeHubTab('student', HUB_PATH.student, '')).toBe('mine');
  });

  it('keeps the digest deep link working', () => {
    expect(activeHubTab('teacher', '/teacher/sketchbook', '?view=rhythm')).toBe('rhythm');
    expect(activeHubTab('teacher', '/teacher/sketchbook', '?view=rhythm&status=needs_call')).toBe('rhythm');
  });

  it('falls back to the first tab for a ?view= nobody serves', () => {
    expect(activeHubTab('teacher', '/teacher/sketchbook', '?view=wall')).toBe('flip');
    expect(activeHubTab('student', '/student/sketchbook', '?view=rhythm')).toBe('mine');
  });

  it('shows Inspiration as active on a drawing inside it, not just the list', () => {
    expect(activeHubTab('teacher', '/teacher/inspiration', '')).toBe('inspiration');
    expect(activeHubTab('teacher', '/teacher/inspiration/11111111-1111-4111-8111-111111111111', '')).toBe('inspiration');
    expect(activeHubTab('student', '/student/inspiration/saved', '')).toBe('inspiration');
  });

  it('does not claim a tab for a per-student or per-sketch page below the hub', () => {
    // These render no tab bar; a bar here would offer to switch away mid-task.
    expect(activeHubTab('teacher', '/teacher/sketchbook/abc', '')).toBeNull();
    expect(activeHubTab('student', '/student/sketchbook/abc', '')).toBeNull();
  });
});

describe('drawings hub: flags', () => {
  it('drops the Inspiration tab when its feature is off, for each role', () => {
    const staffOff = { ...resolveFlags({}), 'staff.inspiration': false };
    expect(visibleHubTabs('teacher', staffOff).map((t) => t.key)).toEqual(['flip', 'rhythm']);

    const studentOff = { ...resolveFlags({}), 'student.inspiration': false };
    expect(visibleHubTabs('student', studentOff).map((t) => t.key)).toEqual(['mine']);
  });

  it('keeps every tab when nothing is switched off', () => {
    const on = { ...resolveFlags({}), 'staff.inspiration': true, 'student.inspiration': true };
    expect(visibleHubTabs('teacher', on)).toHaveLength(3);
    expect(visibleHubTabs('student', on)).toHaveLength(2);
  });

  it('gates each Inspiration tab on the flag that owns its route', () => {
    // If these drift apart the tab shows and the page it opens says the
    // feature is unavailable, which is worse than no tab.
    const byRole = Object.fromEntries(
      (['teacher', 'student'] as const).map((r) => [r, hubTabs(r).find((t) => t.key === 'inspiration')?.flag]),
    );
    expect(byRole).toEqual({ teacher: 'staff.inspiration', student: 'student.inspiration' });
  });
});
