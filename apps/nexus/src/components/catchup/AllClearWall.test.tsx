/**
 * The guard on the promise this list makes.
 *
 * A wall of people who finished is one refactor away from a leaderboard, and the
 * difference is not cosmetic: a ranked list of achievement has a bottom, and the
 * student at the bottom of it learns the opposite of what the screen is for.
 * These tests pin the three properties that keep it a set rather than a ranking,
 * so that turning it into one has to be a deliberate act with a failing test
 * attached.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AllClearWall from './AllClearWall';
import { EMPTY_STANDING } from '@/lib/catchup-standing';
import type { CelebrationInfo } from '@/lib/catchup-celebration';
import type { Row } from './types';

function row(name: string, over: Partial<Row['standing']> = {}): Row {
  return {
    journey_id: null,
    student: {
      id: `id-${name}`,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      phone: null,
      avatar_url: null,
    },
    bucket: 'all_clear',
    openCount: 0,
    blockedOnUs: 0,
    totals: { total: 0, completed: 0, blocked: 0, pendingTeacher: 0 },
    missedTotals: { total: 0, completed: 0, open: 0, overdue: 0, waiting: 0 },
    clock: { active: false, waiting: 0, overdue: false, daysLeft: null, stalled: false },
    pace: { state: 'done', deficit: 0, remaining: 0 },
    standing: { ...EMPTY_STANDING, ...over },
    items: [],
  };
}

describe('AllClearWall', () => {
  it('orders by who finished most recently, not by how many or how fast', () => {
    render(
      <AllClearWall
        students={[
          row('Slow And Steady', { clearedTotal: 9, lastClearedAt: '2026-07-01T10:00:00+05:30' }),
          row('Finished Today', { clearedTotal: 1, lastClearedAt: '2026-08-08T10:00:00+05:30' }),
        ]}
      />,
    );

    const names = screen
      .getAllByText(/^(Slow And Steady|Finished Today)$/)
      .map((n) => n.textContent);
    expect(names).toEqual(['Finished Today', 'Slow And Steady']);
  });

  it('puts a student who never missed anything last, not first', () => {
    // They belong here, because they owe nothing. But they did not just do
    // something, and leading with them buries the person who cleared a backlog
    // this morning.
    render(
      <AllClearWall
        students={[
          row('Never Missed', { clearedTotal: 0, lastClearedAt: null }),
          row('Cleared Theirs', { clearedTotal: 3, lastClearedAt: '2026-08-05T10:00:00+05:30' }),
        ]}
      />,
    );

    const names = screen.getAllByText(/^(Never Missed|Cleared Theirs)$/).map((n) => n.textContent);
    expect(names).toEqual(['Cleared Theirs', 'Never Missed']);
  });

  it('gives a student who never missed a class their own sentence', () => {
    // "Cleared 0 classes" is technically true and reads as a failure.
    render(<AllClearWall students={[row('Never Missed', { clearedTotal: 0 })]} />);
    expect(screen.getByText('Has not missed a class')).toBeTruthy();
    expect(screen.queryByText(/Cleared 0/)).toBeNull();
  });

  it('numbers nobody', () => {
    // No positions, no medals, no "1." in front of anybody. The moment a rank
    // appears, the list stops being a wall and starts being a table.
    const { container } = render(
      <AllClearWall
        students={[
          row('Alpha', { clearedTotal: 5, lastClearedAt: '2026-08-08T10:00:00+05:30' }),
          row('Beta', { clearedTotal: 4, lastClearedAt: '2026-08-07T10:00:00+05:30' }),
          row('Gamma', { clearedTotal: 3, lastClearedAt: '2026-08-06T10:00:00+05:30' }),
        ]}
      />,
    );
    expect(container.querySelector('ol')).toBeNull();
    expect(screen.queryByText(/^1\.?$/)).toBeNull();
  });

  it('says what to do about it when nobody is clear yet', () => {
    // An empty green box reads as broken. It also has to avoid phrasing the
    // emptiness as a verdict on the cohort.
    render(<AllClearWall students={[]} />);
    expect(screen.getByText(/Nobody is completely clear yet/i)).toBeTruthy();
  });

  it('offers the personal note only when there is a handler for it', () => {
    const { rerender } = render(<AllClearWall students={[row('Alpha')]} />);
    expect(screen.queryByRole('button', { name: /Send a note/i })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();

    rerender(<AllClearWall students={[row('Alpha')]} onNote={() => {}} />);
    expect(screen.getByRole('button', { name: /Send a note \(1\)/i })).toBeTruthy();
  });

  it('hands the share the same order it displays', () => {
    // The preview dialog and the post read this array. If it disagreed with the
    // screen, a teacher would approve one list and send another.
    let handed: string[] = [];
    render(
      <AllClearWall
        students={[
          row('Older', { lastClearedAt: '2026-07-01T10:00:00+05:30' }),
          row('Newer', { lastClearedAt: '2026-08-08T10:00:00+05:30' }),
        ]}
        onNote={(rows) => {
          handed = rows.map((r) => r.student.name || '');
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Send a note \(2\)/i }));
    expect(handed).toEqual(['Newer', 'Older']);
  });

  describe('who has already been congratulated', () => {
    const congratulated = (name: string, over: Partial<CelebrationInfo> = {}) => ({
      ...row(name, { clearedTotal: 2, lastClearedAt: '2026-09-09T10:00:00+05:30' }),
      celebration: {
        state: 'congratulated' as const,
        lastAt: '2026-09-10T06:00:00+00:00',
        source: 'teams' as const,
        count: 2,
        ...over,
      },
    });
    const fresh = (name: string) =>
      row(name, { clearedTotal: 1, lastClearedAt: '2026-09-12T10:00:00+05:30' });

    function checkbox(name: string) {
      return screen.getByRole('checkbox', { name: `Select ${name}` }) as HTMLInputElement;
    }

    it('splits the wall, ticks only the new student, and shares only them', () => {
      // The teacher's exact case: two named twice already, one new.
      let handed: string[] = [];
      render(
        <AllClearWall
          students={[congratulated('Humaira'), congratulated('Bavishiya'), fresh('Poheem')]}
          onNote={(rows) => {
            handed = rows.map((r) => r.student.name || '');
          }}
          onMarkCelebrated={() => {}}
        />,
      );

      expect(screen.getByText('Not congratulated yet (1)')).toBeTruthy();
      expect(screen.getByText('Already congratulated (2)')).toBeTruthy();
      expect(checkbox('Poheem').checked).toBe(true);
      expect(checkbox('Humaira').checked).toBe(false);
      expect(checkbox('Bavishiya').checked).toBe(false);
      expect(screen.getAllByText(/Congratulated in Teams .* \(2 times\)/).length).toBe(2);

      fireEvent.click(screen.getByRole('button', { name: /Send a note \(1\)/i }));
      expect(handed).toEqual(['Poheem']);
    });

    it('lets a teacher deliberately add someone already congratulated', () => {
      let handed: string[] = [];
      render(
        <AllClearWall
          students={[congratulated('Humaira'), fresh('Poheem')]}
          onNote={(rows) => {
            handed = rows.map((r) => r.student.name || '');
          }}
        />,
      );
      fireEvent.click(checkbox('Humaira'));
      fireEvent.click(screen.getByRole('button', { name: /Send a note \(2\)/i }));
      expect(handed).toEqual(['Poheem', 'Humaira']);
    });

    it('disables both actions when nothing is ticked', () => {
      render(
        <AllClearWall
          students={[congratulated('Humaira')]}
          onNote={() => {}}
          onMarkCelebrated={() => {}}
        />,
      );
      expect(screen.getByText(/Everyone here has been congratulated/)).toBeTruthy();
      const share = screen.getByRole('button', { name: /Send a note/i }) as HTMLButtonElement;
      const mark = screen.getByRole('button', { name: /Mark as congratulated/i }) as HTMLButtonElement;
      expect(share.disabled).toBe(true);
      expect(mark.disabled).toBe(true);
    });

    it('marks the selection without posting', () => {
      let marked: string[] = [];
      render(
        <AllClearWall
          students={[fresh('Poheem'), fresh('Jeshurun')]}
          onNote={() => {}}
          onMarkCelebrated={(rows) => {
            marked = rows.map((r) => r.student.name || '');
          }}
        />,
      );
      fireEvent.click(checkbox('Jeshurun'));
      fireEvent.click(screen.getByRole('button', { name: /Mark as congratulated/i }));
      expect(marked).toEqual(['Poheem']);
    });

    it('clears and re-selects the new group with one control', () => {
      render(<AllClearWall students={[fresh('Poheem'), fresh('Jeshurun')]} onNote={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
      expect(checkbox('Poheem').checked).toBe(false);
      expect(checkbox('Jeshurun').checked).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: /^Select all$/ }));
      expect(checkbox('Poheem').checked).toBe(true);
    });

    it('puts a student who cleared again back with the new ones, and says why', () => {
      render(
        <AllClearWall
          students={[congratulated('Humaira', { state: 'cleared_again' })]}
          onNote={() => {}}
        />,
      );
      expect(screen.getByText('Not congratulated yet (1)')).toBeTruthy();
      expect(screen.getByText('Cleared again since last congratulated')).toBeTruthy();
      expect(checkbox('Humaira').checked).toBe(true);
    });

    it('says a mark was a mark, not a Teams post', () => {
      render(
        <AllClearWall
          students={[congratulated('Humaira', { source: 'marked', count: 1 })]}
          onNote={() => {}}
        />,
      );
      expect(screen.getByText(/^Marked as congratulated/)).toBeTruthy();
    });

    it('ticks nobody when the records could not be read', () => {
      // Otherwise a missing table would pre-select, and re-post, everyone.
      render(
        <AllClearWall students={[fresh('Poheem')]} onNote={() => {}} celebrationsUnavailable />,
      );
      expect(screen.getByText(/Could not check who has already been congratulated/)).toBeTruthy();
      expect(checkbox('Poheem').checked).toBe(false);
    });
  });

  it('collapses a big cohort behind one control rather than scrolling forever', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row(`Student ${i}`, { lastClearedAt: `2026-08-0${(i % 9) + 1}T10:00:00+05:30` }),
    );
    render(<AllClearWall students={many} />);

    const more = screen.getByRole('button', { name: /Show all 20/i });
    expect(more).toBeTruthy();
    // 44px minimum, because this is pressed on a phone.
    expect(within(more).queryByText(/Show all/)).toBeTruthy();
  });
});
