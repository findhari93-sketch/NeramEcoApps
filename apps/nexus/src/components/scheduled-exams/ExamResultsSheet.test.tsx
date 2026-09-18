import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExamResultsSheet from './ExamResultsSheet';

vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getTeacherToken: async () => 'test_token' }),
}));

const PAYLOAD = {
  data: {
    exam: { id: 'e1', title: 'History of Architecture Test', results_state: 'unpublished' },
    results: {
      stats: { roster: 47, sat: 16, absent: 3, still_to_sit: 19, average: 61, highest: 84, lowest: 30, passed: 12, passing_pct: 40 },
      second: { sat: 9, average: 71, highest: 99, lowest: 44, passed: 8 },
      podium: [],
      drawings_ungraded: 0,
      rows: [
        { student_id: '1', student_name: 'Arun', avatar_url: null, bucket: 'exam_day', sitting: 'main', rank: 1, sitting_size: 16, score: 42, total_marks: 50, percentage: 84, provisional: false },
        { student_id: '2', student_name: 'Kaveya', avatar_url: null, bucket: 'second_sitting', sitting: 'second', rank: 1, sitting_size: 9, score: 45, total_marks: 50, percentage: 90, provisional: false },
        { student_id: '3', student_name: 'Zara', avatar_url: null, bucket: 'still_to_sit', sitting: null, rank: null, sitting_size: 0, score: 0, total_marks: 0, percentage: 0, provisional: false, window_closes_at: '2026-09-19T12:34:00.000Z' },
        { student_id: '4', student_name: 'Meera', avatar_url: null, bucket: 'absent', sitting: null, rank: null, sitting_size: 0, score: 0, total_marks: 0, percentage: 0, provisional: false },
      ],
    },
    sections: [],
    provisional: false,
    blockers: [],
    warnings: ['19 students still have an open window. Publishing now announces exam day results only. They will be ranked in the second sitting.'],
    preview: { text: 'preview', html: '<p>preview</p>' },
    last_published_at: null,
    // The common case: this classroom has a Teams channel, so the channel half
    // of the sheet is real. Sent by the GET route on every payload.
    teams_linked: true,
  },
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as never;
});

const open = () => render(<ExamResultsSheet open examId="e1" onClose={() => {}} />);

describe('ExamResultsSheet', () => {
  it('opens on exam day and shows only that sitting', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(screen.queryByText('Kaveya')).toBeNull();
    expect(screen.queryByText('Zara')).toBeNull();
  });

  it('filters to the second sitting when that card is pressed', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    fireEvent.click(screen.getByTestId('bucket-second_sitting'));
    await waitFor(() => expect(screen.getByText('Kaveya')).toBeTruthy());
    expect(screen.queryByText('Arun')).toBeNull();
  });

  it('marks the selected filter for assistive technology', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('bucket-exam_day')).toBeTruthy());
    expect(screen.getByTestId('bucket-exam_day').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('bucket-second_sitting').getAttribute('aria-pressed')).toBe('false');
  });

  it('labels the publish button with exactly what pressing it does', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('exam-publish-cta')).toBeTruthy());
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish exam day results (1)');
  });

  // The channel hears about an exam once. A republish exists to add the second
  // sitting, which is deliberately never announced.
  it('offers no Teams post once the exam has already been announced', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          ...PAYLOAD.data,
          // A message id, not merely a publish timestamp: the channel has
          // actually heard about this exam. A publish whose Graph post failed
          // stamps the timestamp too, and keying the Teams half on that is what
          // made a failed announcement permanent.
          exam: { ...PAYLOAD.data.exam, results_state: 'final', teams_results_message_id: 'msg-1' },
          last_published_at: '2026-08-19T06:00:00.000Z',
          teams_message_id: 'msg-1',
          teams_linked: true,
        },
      }),
    })) as never;

    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(screen.queryByText(/Post this to the classroom/i)).toBeNull();
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish 1 second sitting result');
  });

  it('renders no disabled control anywhere on the sheet', async () => {
    const { container } = open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(container.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
  });

  // The button stays mounted and clickable while publishing (no dead ends
  // means no disabled attribute), so handlePublish's own re-entry guard is the
  // ONLY thing standing between a double tap and two Teams posts to a real
  // classroom, reaching every student and often a parent twice.
  it('a double tap does not publish twice', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST' && String(url).includes('/notify')) {
        return { ok: true, json: async () => ({ data: { notified: 1 } }) };
      }
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ data: { students: 16, teams_message_id: 'm1', teams_error: null } }),
        };
      }
      return { ok: true, json: async () => PAYLOAD };
    }) as never;

    open();
    const cta = await screen.findByTestId('exam-publish-cta');
    fireEvent.click(cta);
    fireEvent.click(cta);
    await waitFor(() => expect(screen.getByText(/Published to/)).toBeTruthy());

    expect(calls.filter((c) => c.startsWith('POST') && c.includes('/publish')).length).toBe(1);
  });

  it('shows the open window warning rather than hiding it behind publish', async () => {
    open();
    await waitFor(() =>
      expect(screen.getByText(/19 students still have an open window/)).toBeTruthy(),
    );
  });

  // The rule this whole screen is built around: where there is nothing to do,
  // render no button, never a disabled one.
  it('renders no button when nobody has sat the exam yet', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          ...PAYLOAD.data,
          results: {
            ...PAYLOAD.data.results,
            stats: { ...PAYLOAD.data.results.stats, sat: 0, still_to_sit: 2, absent: 0 },
            second: null,
            rows: [
              { student_id: '3', student_name: 'Zara', avatar_url: null, bucket: 'still_to_sit', sitting: null, rank: null, sitting_size: 0, score: 0, total_marks: 0, percentage: 0, provisional: false, window_closes_at: '2026-09-19T12:34:00.000Z' },
              { student_id: '5', student_name: 'Divya', avatar_url: null, bucket: 'still_to_sit', sitting: null, rank: null, sitting_size: 0, score: 0, total_marks: 0, percentage: 0, provisional: false, window_closes_at: '2026-09-20T12:34:00.000Z' },
            ],
          },
          blockers: ['Nobody has sat this exam yet, so there is nothing to publish.'],
          warnings: [],
        },
      }),
    })) as never;

    const { container } = open();
    await waitFor(() => expect(screen.getByText(/Nobody has sat this exam yet/)).toBeTruthy());
    expect(screen.queryByTestId('exam-publish-cta')).toBeNull();
    expect(container.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
    // "Average 0%, highest 0%" printed beside "Nobody has sat this exam yet"
    // reads as a class that scored nothing, which is a different and worse
    // claim than the blocker above it.
    expect(screen.queryByText(/Average \d+%, highest/)).toBeNull();
  });

  /**
   * THE FOURTH STATE, which the original CTA table never enumerated.
   *
   * Publish with ungraded drawings, grade them, reopen the sheet: published
   * before is true and there is no second sitting, so no button rendered at
   * all. results_state stayed 'provisional' forever, every student's card read
   * "Provisional" indefinitely, and the publish route's provisional-to-final
   * point correction could never run.
   */
  describe('finalising a provisional result', () => {
    const provisionalPayload = (over: Record<string, unknown> = {}) => ({
      data: {
        ...PAYLOAD.data,
        exam: {
          ...PAYLOAD.data.exam,
          results_state: 'provisional',
          teams_results_message_id: 'msg-1',
        },
        results: {
          ...PAYLOAD.data.results,
          drawings_ungraded: 0,
          rows: PAYLOAD.data.results.rows.filter((r) => r.bucket !== 'second_sitting'),
        },
        last_published_at: '2026-08-19T06:00:00.000Z',
        teams_message_id: 'msg-1',
        teams_linked: true,
        warnings: [],
        ...over,
      },
    });

    const serve = (payload: unknown) => {
      global.fetch = vi.fn(async () => ({ ok: true, json: async () => payload })) as never;
    };

    it('offers a final publish once the last drawing is marked', async () => {
      serve(provisionalPayload());
      open();
      await waitFor(() => expect(screen.getByTestId('exam-publish-cta')).toBeTruthy());
      expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish final results (1)');
    });

    it('offers nothing while drawings are still being marked', async () => {
      serve(
        provisionalPayload({
          results: {
            ...PAYLOAD.data.results,
            drawings_ungraded: 2,
            rows: PAYLOAD.data.results.rows.filter((r) => r.bucket !== 'second_sitting'),
          },
        }),
      );
      const { container } = open();
      await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
      // Nothing has changed yet, so there is nothing to press, and a disabled
      // button carrying that refusal would be a dead end.
      expect(screen.queryByTestId('exam-publish-cta')).toBeNull();
      expect(container.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
    });

    it('offers nothing once the results are already final', async () => {
      serve(
        provisionalPayload({
          exam: {
            ...PAYLOAD.data.exam,
            results_state: 'final',
            teams_results_message_id: 'msg-1',
          },
        }),
      );
      open();
      await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
      expect(screen.queryByTestId('exam-publish-cta')).toBeNull();
      expect(screen.getByText(/Results last went out on/)).toBeTruthy();
    });

    it('prefers the second sitting label when there is also a late paper', async () => {
      serve(
        provisionalPayload({
          results: { ...PAYLOAD.data.results, drawings_ungraded: 0 },
        }),
      );
      open();
      await waitFor(() => expect(screen.getByTestId('exam-publish-cta')).toBeTruthy());
      expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish 1 second sitting result');
    });
  });

  /**
   * A publish whose Graph post failed stamps last_published_at all the same, so
   * the channel was never told and the old sheet offered no way to tell it.
   */
  it('offers to post to Teams when the channel was never actually told', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          ...PAYLOAD.data,
          exam: { ...PAYLOAD.data.exam, results_state: 'final' },
          results: {
            ...PAYLOAD.data.results,
            rows: PAYLOAD.data.results.rows.filter((r) => r.bucket !== 'second_sitting'),
          },
          last_published_at: '2026-08-19T06:00:00.000Z',
          teams_message_id: null,
          teams_linked: true,
          warnings: [],
        },
      }),
    })) as never;

    open();
    await waitFor(() => expect(screen.getByTestId('exam-publish-cta')).toBeTruthy());
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe(
      'Post the results to the Teams channel',
    );
    // And the preview and the toggle come back with it, so the teacher sees
    // exactly what is about to reach the channel.
    expect(screen.getByText(/Post this to the classroom/i)).toBeTruthy();
  });

  /**
   * A classroom with no Teams link can never become announced, so gating the
   * channel half on "not yet announced" alone showed it forever: the heading,
   * the card preview and a Post to Teams checkbox, on every publish and every
   * republish, none of which could ever do anything. Same rule as the disabled
   * button: where there is nothing to act on, render nothing.
   */
  it('shows nothing about a channel when the classroom has no Teams link', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { ...PAYLOAD.data, teams_linked: false } }),
    })) as never;

    const { container } = open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());

    expect(screen.queryByText(/What goes in the channel/i)).toBeNull();
    expect(screen.queryByText(/Post this to the classroom/i)).toBeNull();
    expect(screen.queryByText('preview')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    // The results themselves still publish, and students are still told
    // privately. Only the channel half is gone.
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish exam day results (1)');
    expect(container.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
  });

  /**
   * The press does two things, so the label names both. A channel card reaches
   * every student and often a parent and cannot be taken back, and "Publish
   * final results (1)" does not say that is about to happen.
   */
  it('says so when finalising also posts the card to the channel', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          ...PAYLOAD.data,
          exam: { ...PAYLOAD.data.exam, results_state: 'provisional' },
          results: {
            ...PAYLOAD.data.results,
            drawings_ungraded: 0,
            rows: PAYLOAD.data.results.rows.filter((r) => r.bucket !== 'second_sitting'),
          },
          last_published_at: '2026-08-19T06:00:00.000Z',
          teams_message_id: null,
          teams_linked: true,
          warnings: [],
        },
      }),
    })) as never;

    open();
    await waitFor(() => expect(screen.getByTestId('exam-publish-cta')).toBeTruthy());
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe(
      'Publish final results (1) and post to the channel',
    );

    // And it stops claiming that the moment the teacher turns the post off.
    fireEvent.click(screen.getByRole('checkbox', { name: /Post this to the classroom/i }));
    await waitFor(() =>
      expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish final results (1)'),
    );
  });
});

/**
 * 2026-09-17. Students who joined after the covered classes are set aside by
 * the publish route, so they are in none of the four groups. The sheet says so
 * in one line, or "16 of 30 sat" on a class of 37 reads as seven lost students.
 */
describe('ExamResultsSheet, students the exam was never set for', () => {
  const withExcused = (excused: Record<string, number> | undefined) => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { ...PAYLOAD.data, results: { ...PAYLOAD.data.results, excused } },
      }),
    })) as never;
  };

  it('says how many joined after the covered classes and are not part of this exam', async () => {
    withExcused({ total: 5, new_joiner: 5, catching_up: 0, by_teacher: 0 });
    open();
    await waitFor(() => expect(screen.getByTestId('exam-excused-line')).toBeTruthy());
    expect(screen.getByTestId('exam-excused-line').textContent).toBe(
      '5 joined after the covered classes and are not part of this exam.',
    );
  });

  it('never lists an excused student under any of the four groups', async () => {
    withExcused({ total: 5, new_joiner: 5, catching_up: 0, by_teacher: 0 });
    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    const total = ['exam_day', 'second_sitting', 'still_to_sit', 'absent']
      .map((b) => Number(screen.getByTestId(`bucket-${b}`).textContent?.match(/\d+/)?.[0] ?? 0))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(PAYLOAD.data.results.rows.length);
  });

  it('says nothing when nobody is excused, or when an older server sends no count', async () => {
    withExcused({ total: 0, new_joiner: 0, catching_up: 0, by_teacher: 0 });
    const first = open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(screen.queryByTestId('exam-excused-line')).toBeNull();
    first.unmount();

    withExcused(undefined);
    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(screen.queryByTestId('exam-excused-line')).toBeNull();
  });

  it('adds no disabled control while saying it', async () => {
    withExcused({ total: 2, new_joiner: 1, catching_up: 1, by_teacher: 0 });
    const { container } = open();
    await waitFor(() => expect(screen.getByTestId('exam-excused-line')).toBeTruthy());
    expect(container.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
  });
});
