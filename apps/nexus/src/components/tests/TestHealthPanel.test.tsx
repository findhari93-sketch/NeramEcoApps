import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestHealthPanel from './TestHealthPanel';

/**
 * The health banner on a paper, after acf8084d.
 *
 * It said "21 students could not submit" and "12 students failed to open the
 * paper", named nobody, and could never be cleared. Four students really could
 * not submit, and the bug behind it was fixed the same day.
 */

// A face is required beside every student name; this stands in for it and
// carries the id so a test can check the right face is beside the right name.
vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ userId }: { userId?: string | null }) => <div data-testid={`avatar-${userId}`} />,
}));

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const submitIssue = {
  stream: 'technical',
  severity: 'error',
  title: '4 students could not submit their answers',
  count: 4,
  phase: 'submit',
};

const health = (over: Record<string, unknown> = {}) => ({
  data: {
    issues: [submitIssue],
    blocking: true,
    affected: {
      submit: [
        {
          student_id: 'kaveya',
          name: 'Kaveya S',
          avatar_url: null,
          last_at: '2026-09-11T10:02:00Z',
          message: 'EXAM_CLOSED',
          times: 3,
        },
        {
          student_id: 'inaya',
          name: 'Inaya Nizamudeen',
          avatar_url: 'https://example.com/inaya.jpg',
          last_at: '2026-09-11T09:40:00Z',
          message: 'Failed to fetch',
          times: 1,
        },
      ],
    },
    cleared: null,
    reports: [],
    ...over,
  },
});

const net = {
  health: [] as Array<() => FakeResponse>,
  clear: [] as Array<() => FakeResponse>,
  undo: [] as Array<() => FakeResponse>,
  calls: [] as Array<{ url: string; method: string; auth: string | null }>,
};

beforeEach(() => {
  net.health = [];
  net.clear = [];
  net.undo = [];
  net.calls = [];
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    net.calls.push({ url, method, auth });
    if (url.endsWith('/health/clear') && method === 'POST') return (net.clear.shift() || (() => reply(201, { data: {} })))();
    if (url.endsWith('/health/clear') && method === 'DELETE') return (net.undo.shift() || (() => reply(200, { data: {} })))();
    const next = net.health.length > 1 ? net.health.shift()! : net.health[0];
    return next ? next() : reply(200, health());
  });
});

const mount = () => render(<TestHealthPanel testId="acf8084d" getToken={async () => 'token-1'} />);

describe('TestHealthPanel', () => {
  it('counts students and lets a teacher see who, face beside name', async () => {
    mount();
    expect(await screen.findByText('4 students could not submit their answers')).not.toBeNull();
    expect(screen.queryByText('Kaveya S')).toBeNull();

    const seeWho = screen.getByRole('button', { name: 'See who' });
    expect(seeWho.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(seeWho);

    const list = await screen.findByRole('list', { name: '4 students could not submit their answers' });
    const kaveya = within(list).getAllByRole('listitem')[0];
    expect(within(kaveya).getByText('Kaveya S')).not.toBeNull();
    expect(within(kaveya).getByTestId('avatar-kaveya')).not.toBeNull();
    expect(within(kaveya).getByText('EXAM_CLOSED')).not.toBeNull();
    expect(within(kaveya).getByText(/3 times/)).not.toBeNull();
    expect(within(list).getByTestId('avatar-inaya')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Hide names' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('marks the paper fixed, hides the App lines, and offers Undo', async () => {
    net.health = [() => reply(200, health()), () => reply(200, health({ issues: [], blocking: false, affected: {}, cleared: { cleared_at: '2026-09-17T10:00:00Z', cleared_by: 't' } }))];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as fixed' }));

    await waitFor(() => expect(screen.queryByText('4 students could not submit their answers')).toBeNull());
    const clearCall = net.calls.find((c) => c.url === '/api/question-bank/tests/acf8084d/health/clear');
    expect(clearCall).toMatchObject({ method: 'POST', auth: 'Bearer token-1' });

    // The banner is gone but the confirmation, and its Undo, stay.
    expect(await screen.findByText(/Marked as fixed/)).not.toBeNull();
    net.health = [() => reply(200, health())];
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('4 students could not submit their answers')).not.toBeNull();
    expect(net.calls.some((c) => c.url.endsWith('/health/clear') && c.method === 'DELETE')).toBe(true);
  });

  it("says why when Mark as fixed is not available on this server", async () => {
    net.clear = [
      () =>
        reply(503, {
          error: 'Mark as fixed is not available on this server yet. The database update it needs has not been applied.',
        }),
    ];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as fixed' }));
    expect(await screen.findByText(/not available on this server yet/)).not.toBeNull();
    // Nothing was hidden.
    expect(screen.getByText('4 students could not submit their answers')).not.toBeNull();
  });

  it('explains what the button does before it is pressed', async () => {
    mount();
    await screen.findByRole('button', { name: 'Mark as fixed' });
    expect(screen.getByText(/Hides the App lines above/)).not.toBeNull();
  });

  it('offers no Mark as fixed when nothing on the paper is an App problem', async () => {
    net.health = [
      () =>
        reply(
          200,
          health({
            issues: [{ stream: 'structural', severity: 'error', title: 'This paper has no questions. It cannot be sat.', count: 1 }],
            affected: {},
          }),
        ),
    ];
    mount();
    expect(await screen.findByText('This paper has no questions. It cannot be sat.')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as fixed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'See who' })).toBeNull();
  });

  it('renders nothing for a healthy paper', async () => {
    net.health = [() => reply(200, health({ issues: [], blocking: false, affected: {} }))];
    const { container } = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
