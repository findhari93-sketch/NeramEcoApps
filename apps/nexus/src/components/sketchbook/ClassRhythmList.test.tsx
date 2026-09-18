import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { RhythmStatus, StripDay } from '@/lib/sketchbook-status';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't' }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({
  useStudentStageFacts: () => ({ factsFor: () => null, ready: true }),
}));
// See FlipThrough.test.tsx for why this renders an aria-label rather than text content.
vi.mock('@/components/students/StudentStageAvatar', () => ({ default: ({ name }: { name?: string | null }) => <div aria-label={name ? `Avatar for ${name}` : 'Avatar'} /> }));

import ClassRhythmList from './ClassRhythmList';

const strip: StripDay[] = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(7 + i).padStart(2, '0')}`, state: 'missed', today: i === 9 }));

const STUDENT_A = '11111111-1111-4111-8111-111111111111';

const student = (id: string, name: string, status: RhythmStatus, label: string, quietDays: number, sketch = false) => ({
  userId: id, name, email: null, avatarUrl: null, msOid: null, enrolledAt: '2026-06-01T00:00:00Z', start: '2026-09-12',
  status, label, quietDays, lastDrawingDate: null, week: { count: status === 'on_track' ? 3 : 1, goal: 3 }, strip,
  run: 0, remindersThisCycle: 0, lastRemindedOn: null,
  latestSketch: sketch ? { id: `sk-${id}`, thumbUrl: 'https://x.test/t.jpg', submittedAt: '2026-09-15T10:00:00Z' } : null,
});

const payload = {
  goal: 3, startedOn: '2026-09-12', today: '2026-09-16', pausedCount: 3,
  students: [
    student(STUDENT_A, 'Asha', 'on_track', 'Goal met', 0, true),
    student('b', 'Bala', 'needs_nudge', 'No drawing yet, 4 days', 4),
    student('c', 'Charu', 'needs_nudge', 'Quiet 9 days', 9),
    student('d', 'Devi', 'behind', 'Behind, 1 of 3', 1),
  ],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/teacher/sketchbook?view=rhythm');
  swr.mockReturnValue({ data: payload, isLoading: false, mutate: vi.fn() });
});

describe('ClassRhythmList', () => {
  it('lists who needs the teacher first, with honest labels and no "8 weeks"', () => {
    render(<ClassRhythmList classroomId="c1" />);
    const names = screen.getAllByTestId('rhythm-row-name').map((n) => n.textContent);
    expect(names).toEqual(['Charu', 'Bala', 'Devi', 'Asha']);
    expect(screen.getByText('Weekly goal: 3 days')).toBeTruthy();
    expect(screen.getByText('No drawing yet, 4 days')).toBeTruthy();
    expect(screen.queryByText(/8 weeks/)).toBeNull();
  });

  it('the cards are the filters', () => {
    render(<ClassRhythmList classroomId="c1" />);
    fireEvent.click(screen.getByTestId('stat-tile-needs_nudge'));
    expect(screen.getAllByTestId('rhythm-row-name').map((n) => n.textContent)).toEqual(['Charu', 'Bala']);
    expect(window.location.search).toContain('status=needs_nudge');
    // Pressing the active card again shows everyone.
    fireEvent.click(screen.getByTestId('stat-tile-needs_nudge'));
    expect(screen.getAllByTestId('rhythm-row-name')).toHaveLength(4);
  });

  it('hides an empty Needs a call card', () => {
    render(<ClassRhythmList classroomId="c1" />);
    expect(screen.queryByTestId('stat-tile-needs_call')).toBeNull();
    expect(screen.queryByTestId('stat-tile-not_started')).toBeNull();
  });

  it('links the latest sketch thumbnail and says how many paused students are hidden', () => {
    render(<ClassRhythmList classroomId="c1" />);
    const asha = screen.getAllByTestId('rhythm-row').find((r) => within(r).queryByText('Asha'))!;
    const thumb = within(asha).getByRole('link', { name: /latest drawing/ });
    expect(thumb.getAttribute('href')).toBe(`/teacher/drawing-reviews/sk-${STUDENT_A}?from=sketchbook&student=${STUDENT_A}`);
    expect(screen.getByTestId('paused-footnote').textContent).toBe('3 paused students are not shown.');
  });

  it('restores the card filter from the URL', () => {
    window.history.replaceState(null, '', '/teacher/sketchbook?view=rhythm&status=behind');
    render(<ClassRhythmList classroomId="c1" />);
    expect(screen.getAllByTestId('rhythm-row-name').map((n) => n.textContent)).toEqual(['Devi']);
  });

  it('keeps the filter in the URL under React Strict Mode (the dev double mount)', () => {
    window.history.replaceState(null, '', '/teacher/sketchbook?view=rhythm&status=behind');
    render(<StrictMode><ClassRhythmList classroomId="c1" /></StrictMode>);
    expect(screen.getAllByTestId('rhythm-row-name').map((n) => n.textContent)).toEqual(['Devi']);
    expect(window.location.search).toContain('status=behind');
  });
});
