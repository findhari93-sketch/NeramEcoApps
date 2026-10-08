import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TEST_OPEN } from '@/lib/assistant/tutor/copy';
import type { TutorEnvelope } from '@/lib/assistant/tutor/types';
import TutorPanel from './TutorPanel';
import { NOT_READY, type TutorSession } from './useTutorSession';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/components/assistant/client', () => ({ getAiStatus: vi.fn(async () => null) }));

function session(over: Partial<TutorSession> = {}): TutorSession {
  return {
    questionId: 'q1',
    turns: [],
    pending: false,
    error: null,
    latest: null,
    phase: null,
    progress: null,
    hintsUsed: 0,
    started: true,
    notReady: false,
    saved: new Set(),
    openCheck: null,
    start: vi.fn(),
    send: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    ...over,
  };
}

const props = { onClose: vi.fn(), getToken: async () => 't', onOpenSimilar: vi.fn() };

describe('TutorPanel', () => {
  it('greets while the first reply is on its way', () => {
    render(<TutorPanel {...props} session={session({ started: false })} />);
    expect(screen.getByText("Let's work through this together.")).toBeTruthy();
  });

  it('says a test is running in the middle, with a way to it and no box to type into', () => {
    const s = session({ error: { message: TEST_OPEN, status: 409, retryable: true } });
    render(<TutorPanel {...props} session={s} />);
    expect(screen.getByText('You have a test running')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to my test' }).getAttribute('href')).toBe('/student/tests');
    expect(screen.queryByTestId('tutor-composer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'I have finished it' }));
    expect(s.retry).toHaveBeenCalled();
  });

  it('with no pack, offers to answer it in the question instead', () => {
    render(<TutorPanel {...props} session={session({ notReady: true })} />);
    expect(screen.getByText(NOT_READY)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Answer it in the question' }));
    expect(props.onClose).toHaveBeenCalled();
    expect(screen.queryByTestId('tutor-composer')).toBeNull();
  });

  it('fills the recommended chip, and Try it myself hands the student to the question', () => {
    const latest = {
      blocks: [{ id: 'b1', kind: 'tutor_text', md: 'Where would you like to start?' }],
      chips: [
        { label: 'Guide me', action: { type: 'guide_me' } },
        { label: 'Try it myself', action: { type: 'try_myself' } },
      ],
    } as unknown as TutorEnvelope;
    const s = session({ latest, turns: [{ id: 't1', who: 'tutor', envelope: latest }] });
    const onTryMyself = vi.fn();
    render(<TutorPanel {...props} session={s} onTryMyself={onTryMyself} />);
    const chips = screen.getAllByTestId('tutor-chip');
    expect(chips[0].className).toMatch(/MuiChip-filled/);
    expect(chips[1].className).toMatch(/MuiChip-outlined/);
    fireEvent.click(chips[1]);
    expect(s.send).toHaveBeenCalledWith({ type: 'try_myself' }, 'Try it myself');
    expect(onTryMyself).toHaveBeenCalled();
    expect(screen.getByTestId('tutor-composer')).toBeTruthy();
  });

  it('sends on Enter and keeps Shift+Enter for a new line', () => {
    const s = session({ turns: [{ id: 't1', who: 'tutor', envelope: { blocks: [], chips: [] } as unknown as TutorEnvelope }] });
    render(<TutorPanel {...props} session={s} />);
    const box = screen.getByTestId('tutor-composer');
    fireEvent.change(box, { target: { value: 'why' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(s.send).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(s.send).toHaveBeenCalledWith({ type: 'answer', text: 'why' }, 'why');
  });
});
