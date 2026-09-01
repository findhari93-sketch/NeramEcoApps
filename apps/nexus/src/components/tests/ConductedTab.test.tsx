import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConductedTab from './ConductedTab';

/**
 * The record of what a class has sat.
 *
 * Fixtures are the real production run: paper acf8084d "History of Architecture
 * Test", sat as an exam on 18 Aug by 16 of 36 enrolled students, 11 passing at
 * 80%, results still unpublished. That run was reachable from nowhere in the
 * Tests hub, which is why this tab exists.
 */

const EXAM = {
  placement_id: 'c39e7fe6',
  test_id: 'acf8084d',
  kind: 'exam' as const,
  title: 'History of Architecture Test',
  class_title: 'History of Architecture Test',
  classroom_name: 'JEE B.Arch Session 1',
  at: '2026-08-18T08:30:00Z',
  students_sat: 16,
  attempts: 16,
  passed: 11,
  enrolled: 36,
  passing_pct: 80,
  results_unpublished: true,
  href: '/teacher/tests/acf8084d?tab=results&placement_id=c39e7fe6',
};

const CATCHUP = {
  ...EXAM,
  placement_id: 'e6883242',
  test_id: '1f0a746f',
  kind: 'catchup' as const,
  title: 'Perspective Cube Composition: class test',
  class_title: 'Perspective Cube Composition',
  at: '2026-08-29T00:00:00+05:30',
  students_sat: 4,
  attempts: 5,
  passed: 2,
  results_unpublished: false,
  href: '/teacher/tests/1f0a746f?tab=results&placement_id=e6883242',
};

function mountWith(runs: unknown[], onOpen = vi.fn()) {
  // Typed with the url arg so `mock.calls[0][0]` is the request, not `never`.
  const authFetch = vi.fn(async (_url: string) => ({
    data: { runs, classroom_name: 'JEE B.Arch Session 1', enrolled: 36 },
  }));
  render(
    <ConductedTab classroomId="8876a8fc" authFetch={authFetch as never} onOpen={onOpen} />,
  );
  return { authFetch, onOpen };
}

describe('ConductedTab', () => {
  it('shows the date, the class and the paper for a run the class has sat', async () => {
    mountWith([EXAM]);

    await waitFor(() => expect(screen.getByText('History of Architecture Test')).not.toBeNull());
    expect(screen.getByText('18 Aug')).not.toBeNull();
    expect(screen.getByText(/JEE B.Arch Session 1/)).not.toBeNull();
    expect(screen.getByText('Exam')).not.toBeNull();
  });

  /**
   * Three independent facts, never "16 of 36". A ratio reads as a target and
   * would then contradict the results page, whose DONE tile counts only the
   * students the eligibility engine says the run was set for.
   */
  it('states three counts and never prints a ratio', async () => {
    mountWith([EXAM]);

    await waitFor(() => expect(screen.getByText(/16 sat/)).not.toBeNull());
    expect(screen.getByText('16 sat · 11 passed · 36 enrolled')).not.toBeNull();

    const ratio = Array.from(document.body.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && /\d+\s+of\s+\d+/.test(el.textContent || ''),
    );
    expect(ratio).toHaveLength(0);
  });

  it('leaves the passed count out when the run has no pass mark', async () => {
    mountWith([{ ...EXAM, passing_pct: null, passed: 0 }]);

    await waitFor(() => expect(screen.getByText(/16 sat/)).not.toBeNull());
    expect(screen.getByText('16 sat · 36 enrolled')).not.toBeNull();
  });

  /** The one thing on the row a teacher can act on straight away. */
  it('flags an exam whose students still cannot see their answers', async () => {
    mountWith([EXAM]);
    await waitFor(() => expect(screen.getByText('Results not published')).not.toBeNull());
  });

  it('does not flag a run that reveals answers on submit', async () => {
    mountWith([CATCHUP]);
    await waitFor(() => expect(screen.getByText(/Perspective Cube/)).not.toBeNull());
    expect(screen.queryByText('Results not published')).toBeNull();
  });

  /**
   * Catch-up papers are auto-titled "{class}: class test", so echoing the class
   * under the title would print the same words twice on twenty rows.
   */
  it('does not repeat the class name under a title that already carries it', async () => {
    mountWith([CATCHUP]);
    await waitFor(() => expect(screen.getByText(/Perspective Cube Composition: class test/)).not.toBeNull());
    expect(screen.queryByText(/^Follows/)).toBeNull();
  });

  it('names the lecture when the paper title does not', async () => {
    mountWith([{ ...EXAM, title: 'Chapter 4 revision', class_title: 'Islamic Architecture in India' }]);
    await waitFor(() => expect(screen.getByText('Follows Islamic Architecture in India')).not.toBeNull());
  });

  it('opens the results of that exact run, not the paper', async () => {
    const onOpen = vi.fn();
    mountWith([EXAM], onOpen);

    await waitFor(() => expect(screen.getByText('History of Architecture Test')).not.toBeNull());
    fireEvent.click(screen.getByText('History of Architecture Test'));
    expect(onOpen).toHaveBeenCalledWith('/teacher/tests/acf8084d?tab=results&placement_id=c39e7fe6');
  });

  it('asks only for the conducted kinds until a filter says otherwise', async () => {
    const { authFetch } = mountWith([EXAM]);

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    expect(authFetch.mock.calls[0][0]).toContain('include=exam,class_test,assigned');

    fireEvent.click(screen.getByText('Catch-up'));
    await waitFor(() => expect(authFetch.mock.calls.length).toBeGreaterThan(1));
    expect(authFetch.mock.calls[authFetch.mock.calls.length - 1][0]).toContain('include=catchup');
  });

  /** Two different nothings, and a teacher needs to know which one they hit. */
  it('tells a teacher to pick a class rather than claiming nothing was sat', () => {
    render(<ConductedTab classroomId={null} authFetch={vi.fn() as never} onOpen={vi.fn()} />);
    expect(screen.getByText(/Pick your class at the top of the screen/)).not.toBeNull();
    expect(screen.queryByText(/has not sat a test yet/)).toBeNull();
  });

  it('says the class has sat nothing when it genuinely has not', async () => {
    mountWith([]);
    await waitFor(() => expect(screen.getByText(/has not sat a test yet/)).not.toBeNull());
  });

  it('says the filter is empty rather than the class being idle', async () => {
    mountWith([]);
    await waitFor(() => expect(screen.getByText(/has not sat a test yet/)).not.toBeNull());

    fireEvent.click(screen.getByText('Before class'));
    await waitFor(() => expect(screen.getByText('Nothing here with that filter.')).not.toBeNull());
  });

  it('surfaces a failure instead of rendering an empty class', async () => {
    const authFetch = vi.fn(async () => {
      throw new Error('Staff only');
    });
    render(<ConductedTab classroomId="8876a8fc" authFetch={authFetch as never} onOpen={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Staff only')).not.toBeNull());
  });
});
