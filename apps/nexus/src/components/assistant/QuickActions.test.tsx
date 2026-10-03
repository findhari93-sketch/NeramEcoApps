import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { routeIntent } from '@/lib/assistant/router';
import QuickActions from './QuickActions';

function sent(): string[] {
  const onSend = vi.fn();
  render(<QuickActions onSend={onSend} onReport={vi.fn()} />);
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
    render(<QuickActions onSend={onSend} onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /Report a problem/ }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});
