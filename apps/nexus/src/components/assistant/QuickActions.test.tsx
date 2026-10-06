import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { routeIntent } from '@/lib/assistant/router';
import QuickActions from './QuickActions';

function sent(): string[] {
  const onSend = vi.fn();
  render(<QuickActions onSend={onSend} onReport={vi.fn()} sketchbook />);
  for (const name of [/What.s on today/, /I can.t attend a class/, /Remind me/, /Add a sketch/]) {
    fireEvent.click(screen.getByRole('button', { name }));
  }
  return onSend.mock.calls.map((c) => c[0] as string);
}

describe('QuickActions', () => {
  it('sends the words the student would type, so the chat shows what they tapped', () => {
    expect(sent()).toEqual(["What's on today?", "I can't attend a class", 'Remind me', 'Add a sketch']);
  });

  it('each quick action reaches the tool or flow it promises', () => {
    const [today, cannot, remind, sketch] = sent();
    const page = { path: '/student/dashboard' };
    expect(routeIntent(today, page)).toEqual({ kind: 'tool', tool: 'my_brief' });
    expect(routeIntent(cannot, page)).toEqual({ kind: 'flow', flow: 'cannot-attend' });
    expect(routeIntent(remind, page)).toEqual({ kind: 'flow', flow: 'remind-me' });
    expect(routeIntent(sketch, page)).toEqual({ kind: 'flow', flow: 'upload-sketch' });
  });

  it('Report a problem opens the report form and sends nothing', () => {
    const onSend = vi.fn();
    const onReport = vi.fn();
    render(<QuickActions onSend={onSend} onReport={onReport} sketchbook />);
    fireEvent.click(screen.getByRole('button', { name: /Report a problem/ }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('has no Add a sketch row while the sketchbook is off (Ruling 25)', () => {
    render(<QuickActions onSend={vi.fn()} onReport={vi.fn()} sketchbook={false} />);
    expect(screen.queryByRole('button', { name: /Add a sketch/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remind me/ })).not.toBeNull();
  });

  it('with a bank question open, Explain and Hint lead and reach exam help with the open question', () => {
    const onSend = vi.fn();
    render(<QuickActions onSend={onSend} onReport={vi.fn()} sketchbook exam="question" />);
    const rows = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rows[0]).toMatch(/^Explain this question/);
    expect(rows[1]).toMatch(/^Give me a hint/);
    fireEvent.click(screen.getByRole('button', { name: /Explain this question/ }));
    fireEvent.click(screen.getByRole('button', { name: /Give me a hint/ }));
    const page = { path: '/student/question-bank/questions', questionId: 'a1b2c3d4-0000-4000-8000-000000000001' };
    for (const [text] of onSend.mock.calls) expect(routeIntent(text, page)).toEqual({ kind: 'llm', mode: 'exam' });
  });

  it('elsewhere, the maths row puts the cursor in the message box and sends nothing', () => {
    const onSend = vi.fn();
    const onAsk = vi.fn();
    render(<QuickActions onSend={onSend} onReport={vi.fn()} sketchbook exam="bank" onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask a maths or exam question/ }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Explain this question/ })).toBeNull();
  });

  it('offers no maths tutor while the question bank is off', () => {
    render(<QuickActions onSend={vi.fn()} onReport={vi.fn()} sketchbook exam={null} onAsk={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /maths|Explain this question/i })).toBeNull();
  });
});
