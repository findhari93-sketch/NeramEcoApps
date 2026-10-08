import { describe, expect, it } from 'vitest';
import { isNexusPath, notificationHref } from './notification-links';

const row = (event_type: string, metadata: Record<string, unknown> | null = null) => ({ event_type, metadata });

describe('notificationHref', () => {
  it('lets a sender-written href win for any event type', () => {
    expect(
      notificationHref(row('catchup_digest', { href: '/teacher/catch-up?view=calendar&class=c1' }), 'teacher'),
    ).toBe('/teacher/catch-up?view=calendar&class=c1');
    expect(notificationHref(row('assignment_nudge', { href: '/student/x', assignment_ids: ['a1'] }), 'student')).toBe(
      '/student/x',
    );
  });

  it('never follows an href to another host', () => {
    expect(notificationHref(row('catchup_digest', { href: '//evil.example/x' }), 'teacher')).toBe('/teacher/catch-up');
    expect(notificationHref(row('catchup_digest', { href: 'https://evil.example' }), 'teacher')).toBe(
      '/teacher/catch-up',
    );
  });

  it('opens the teacher catch-up page for the digest when no href was written', () => {
    expect(notificationHref(row('catchup_digest', { classroom_id: 'r1' }), 'teacher')).toBe('/teacher/catch-up');
  });

  it('keeps the existing per-event mapping', () => {
    expect(notificationHref(row('assignment_nudge', { assignment_ids: ['a1'] }), 'student')).toBe(
      '/student/assignments/a1',
    );
    expect(notificationHref(row('exam_result', { class_id: 'k1' }), 'student')).toBe('/student/timetable/k1/exam');
    expect(notificationHref(row('result_dispute_raised', { issue_id: 'i1' }), 'teacher')).toBe(
      '/teacher/issues?issue=i1',
    );
    expect(notificationHref(row('test_regraded', { test_id: 't1', placement_id: 'p1' }), 'teacher')).toBe(
      '/teacher/tests/t1?tab=results&placement_id=p1',
    );
    expect(notificationHref(row('test_result_message', { template: 'why', placement_id: 'p1', test_id: 't1' }), 'student')).toBe(
      '/student/tests?why=p1',
    );
  });

  it('returns null for an event type it does not know', () => {
    expect(notificationHref(row('something_new'), 'student')).toBeNull();
  });
});

describe('isNexusPath', () => {
  it('accepts a path and refuses everything else', () => {
    expect(isNexusPath('/a')).toBe(true);
    expect(isNexusPath('//a')).toBe(false);
    expect(isNexusPath('a')).toBe(false);
    expect(isNexusPath(undefined)).toBe(false);
  });
});
