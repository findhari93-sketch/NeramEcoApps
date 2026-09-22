import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { QBReportQueueItem } from '@neram/database';

/**
 * The Reports queue: every reported problem across the bank, with where it
 * lives and the way to it, and the same two actions as the paper's pane.
 */

const auth = vi.hoisted(() => ({ getToken: async () => 't', getTeacherToken: async () => 'chat' }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const { default: Page } = await import('./page');

// A fresh SWR cache per test, or one test's queue shows up in the next.
const TeacherReportsPage = () => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <Page />
  </SWRConfig>
);

function item(over: Partial<QBReportQueueItem> = {}): QBReportQueueItem {
  return {
    question_id: 'q31',
    target: 'video',
    part_label: null,
    status: 'open',
    students: 2,
    reasons: [{ reason: 'wrong_working', count: 2 }],
    notes: [],
    first_reported_at: '2026-09-20T10:00:00Z',
    last_reported_at: '2026-09-21T10:00:00Z',
    changed_since_reported: false,
    resolution_note: null,
    resolved_at: null,
    question_text: 'Houses located on which slopes get more sun in winter?',
    paper_id: 'p2015',
    paper_label: 'JEE Paper 2 2015',
    question_number: 31,
    ...over,
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function serve(items: QBReportQueueItem[], counts = { open: items.length, resolved: 3, dismissed: 1 }) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ data: { resolved: 2, notified: 2 } }) };
    return { ok: true, status: 200, json: async () => ({ data: items, counts }) };
  });
}

describe('Teacher reports queue', () => {
  it('uses the counts as the filters, starting on Open', async () => {
    serve([item()]);
    render(<TeacherReportsPage />);
    const open = await screen.findByRole('button', { name: 'Open, 1' });
    expect(open.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Fixed, 3' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=resolved'))).toBe(true),
    );
  });

  it('says where the question lives, and opens it in its paper in the right mode', async () => {
    serve([item()]);
    render(<TeacherReportsPage />);
    expect(await screen.findByText('JEE Paper 2 2015, Q31')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Open in paper' }).getAttribute('href')).toBe(
      '/teacher/question-bank/papers/p2015?q=q31&mode=videos',
    );
  });

  it('marks a problem fixed from the queue, as the teacher, so the students hear from them', async () => {
    serve([item()]);
    render(<TeacherReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark fixed' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(post?.[0]).toBe('/api/question-bank/questions/q31/reports/resolve');
      expect((post?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer chat');
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ target: 'video', part_label: null, outcome: 'fixed', note: '' });
    });
  });

  it('says there is nothing to do when the queue is empty', async () => {
    serve([], { open: 0, resolved: 0, dismissed: 0 });
    render(<TeacherReportsPage />);
    expect(await screen.findByText('Nothing reported right now')).not.toBeNull();
  });
});
