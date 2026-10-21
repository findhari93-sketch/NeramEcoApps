/**
 * Render tests for Admin > Aintra Inbox > Tools chat (Aintra (Tools app)): the
 * totals, the filters and a transcript with its cards, tools and the sign-in
 * gate. The admin E2E spec skips without a Microsoft session, so this is where
 * the tab is exercised on every run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ToolsChatTab from './ToolsChatTab';

const THREAD_A = '11111111-1111-1111-1111-111111111111';
const THREAD_B = '22222222-2222-2222-2222-222222222222';

const VIEW = {
  stats: { threads: 2, questions: 4, answers: 2, signedInThreads: 1, guestThreads: 1, gatedQuestions: 1, failedAnswers: 1, medianMs: 3200 },
  threads: [
    { id: THREAD_A, userId: 'u1', anonId: null, firstQuestion: 'When is NATA 2027?', lastQuestion: 'When is NATA 2027?', questions: 1, answers: 1, failed: 0, gated: 0, tools: ['exam_dates'], startedAt: '2026-10-20T10:00:00Z', lastAt: '2026-10-20T10:00:00Z' },
    { id: THREAD_B, userId: null, anonId: 'anon_0123456789abcdef0123456789abcdef', firstQuestion: 'CBSE 450, NATA 120. Which TNEA colleges?', lastQuestion: 'And KEAM?', questions: 3, answers: 1, failed: 1, gated: 1, tools: ['calculate_cutoff', 'predict_colleges'], startedAt: '2026-10-20T08:00:00Z', lastAt: '2026-10-20T08:10:00Z' },
  ],
  tools: [
    { name: 'calculate_cutoff', calls: 5, failed: 0 },
    { name: 'predict_colleges', calls: 3, failed: 1 },
  ],
  missing: [{ name: 'predict_colleges', count: 1 }],
  people: { u1: { name: 'Test Student', phone: '+91 90000 00000', email: null, enrolled: false } },
  truncated: false,
  generatedAt: '2026-10-20T11:00:00Z',
};

const MESSAGES = [
  { id: 'a', role: 'user', text: 'CBSE 450, NATA 120. Which TNEA colleges?', cards: [], tool_calls: null, error: null, response_ms: null, created_at: '2026-10-20T08:00:00Z' },
  {
    id: 'b',
    role: 'assistant',
    text: 'Your cutoff is 300 out of 400.',
    cards: [{ kind: 'cutoff', data: { total: 300, board200: 180, nata: 120 } }],
    tool_calls: [
      { name: 'calculate_cutoff', ok: true },
      { name: 'predict_colleges', ok: false },
    ],
    error: null,
    response_ms: 4100,
    created_at: '2026-10-20T08:00:05Z',
  },
  { id: 'c', role: 'user', text: 'And KEAM?', cards: [], tool_calls: null, error: 'SIGNUP_REQUIRED', response_ms: null, created_at: '2026-10-20T08:10:00Z' },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('thread=') ? { messages: MESSAGES } : VIEW;
      return { ok: true, json: async () => body } as Response;
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Tools chat tab', () => {
  it('shows the totals, tool use and every conversation', async () => {
    render(<ToolsChatTab />);
    expect(await screen.findByText('When is NATA 2027?')).toBeTruthy();
    expect(screen.getByText('CBSE 450, NATA 120. Which TNEA colleges?')).toBeTruthy();
    expect(screen.getByText('3.2s')).toBeTruthy();
    expect(screen.getByText('Tools it used')).toBeTruthy();
    expect(screen.getAllByText('Asked to sign in').length).toBeGreaterThan(0);
    // The signed-in student is named, the guest is not.
    expect(screen.getByText(/Test Student · 1 question/)).toBeTruthy();
  });

  it('filters to failed answers and to signed-in students', async () => {
    render(<ToolsChatTab />);
    await screen.findByText('When is NATA 2027?');
    fireEvent.click(screen.getByRole('button', { name: 'Failed answers' }));
    expect(screen.queryByText('When is NATA 2027?')).toBeNull();
    expect(screen.getByText('CBSE 450, NATA 120. Which TNEA colleges?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Signed in' }));
    expect(screen.getByText('When is NATA 2027?')).toBeTruthy();
  });

  it('opens a transcript with cards, tools and the sign-in gate', async () => {
    render(<ToolsChatTab />);
    fireEvent.click(await screen.findByText('CBSE 450, NATA 120. Which TNEA colleges?'));
    await waitFor(() => expect(screen.getByText('Cutoff 300/400 (board 180 + NATA 120)')).toBeTruthy());
    expect(screen.getByText('Colleges: no answer')).toBeTruthy();
    expect(screen.getByText('Asked to sign in (not answered)')).toBeTruthy();
    expect(screen.getByText(/4\.1s/)).toBeTruthy();
  });
});
