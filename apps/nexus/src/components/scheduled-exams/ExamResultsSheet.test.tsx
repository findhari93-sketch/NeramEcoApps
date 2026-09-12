import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExamResultsSheet from './ExamResultsSheet';

vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken: async () => 'test_token' }),
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
          exam: { ...PAYLOAD.data.exam, results_state: 'final' },
          last_published_at: '2026-08-19T06:00:00.000Z',
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
  });
});
