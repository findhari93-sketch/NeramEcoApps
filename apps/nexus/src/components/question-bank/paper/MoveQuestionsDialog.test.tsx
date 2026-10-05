import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MoveQuestionsDialog from './MoveQuestionsDialog';

/**
 * Push mode, from a paper's selection bar: what the dialog offers, what it
 * refuses before Move, and what it sends. The rules themselves are covered in
 * lib/qb-move-plan.test.ts; this pins the wiring.
 *
 * Plain DOM assertions: jest-dom matchers pass vitest here and then fail the
 * Nexus type-check, which does not load their types.
 */

const mocks = vi.hoisted(() => ({
  auth: { getToken: vi.fn(async () => 'tok'), tokenReady: true },
  authSWR: vi.fn(),
}));

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => mocks.auth }));
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (key: string | null) => mocks.authSWR(key) }));

const P2A = { id: 'p2a', exam_type: 'JEE_PAPER_2', year: 2021, session: 'Session 1', shift: 'afternoon' };
const NATA = { id: 'nata', exam_type: 'NATA', year: 2024, session: 'Test 1', shift: null };

const planning = (id: string, n: number) => ({
  id,
  section: 'drawing',
  display_order: n,
  question_format: 'MCQ',
  question_text: `Planning ${n}`,
});
const drawing = { id: 'd1', section: 'drawing', display_order: 1, question_format: 'DRAWING_PROMPT', question_text: 'Draw' };

function renderPush(questions = [planning('q1', 1), planning('q2', 2)], onMoved = vi.fn()) {
  render(
    <MoveQuestionsDialog open mode="push" sourcePaper={P2A as never} questions={questions} onClose={vi.fn()} onMoved={onMoved} />,
  );
  return onMoved;
}

beforeEach(() => {
  mocks.authSWR.mockImplementation((key: string | null) => ({
    data: key?.startsWith('/api/question-bank/papers') ? { data: [P2A, NATA] } : undefined,
    isLoading: false,
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: { paper_id: 'new-2b', created_paper: true, moved: 2, copied: 80 } }))),
  );
});

describe('MoveQuestionsDialog (push)', () => {
  it('opens on 2B for a B.Arch paper, offers to create the sitting, and starts on Planning', () => {
    renderPush();
    expect((screen.getByRole('radio', { name: 'JEE Paper 2B (B.Planning)' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /JEE Paper 2A \(B\.Arch\) \(this paper\)/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('This paper does not exist yet. Moving creates it.')).toBeTruthy();
    expect(
      screen.getByText(
        'Move 2 questions from JEE Paper 2A (B.Arch) 2021 Session 1 (AN) to JEE Paper 2B (B.Planning) 2021 Session 1 (AN), into Planning.',
      ),
    ).toBeTruthy();
  });

  it('sends the exam type when the paper is to be created, and reports the move', async () => {
    const onMoved = renderPush();
    fireEvent.click(screen.getByRole('button', { name: /Move 2/ }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/question-bank/papers/p2a/move-questions');
    expect(JSON.parse(init.body)).toEqual({ question_ids: ['q1', 'q2'], target_exam_type: 'JEE_PAPER_2B', section: 'planning' });
    expect(onMoved.mock.calls[0][1]).toBe(
      'Moved 2 questions to JEE Paper 2B (B.Planning) 2021 Session 1 (AN). 80 Maths and Aptitude questions copied there too.',
    );
  });

  it('holds Move back while a drawing is in the selection, until it is left out', () => {
    renderPush([planning('q1', 1), drawing]);
    expect(screen.getByText('1 drawing question can only go into a Drawing section.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Move 2/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Leave it out' }));
    expect((screen.getByRole('button', { name: /Move 1/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('targets a picked NATA paper by id', async () => {
    renderPush([{ ...planning('q1', 1), section: 'aptitude' }]);
    fireEvent.click(screen.getByRole('radio', { name: 'NATA' }));
    fireEvent.click(screen.getByRole('button', { name: /Move 1/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ question_ids: ['q1'], target_paper_id: 'nata', section: null });
  });
});
