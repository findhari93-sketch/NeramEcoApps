import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

const wrap = (ui: React.ReactElement) => render(ui);
const env = (over: Record<string, unknown>) => ({ reply: 'x', suggestions: [], links: [], action: null, mode: 'general', threadId: 't', ...over });

describe('MessageBubble mode chip', () => {
  it('labels a model answer in exam mode as Exam help', () => {
    wrap(<MessageBubble message={{ id: '1', role: 'assistant', text: 'Integrate by parts.', envelope: env({ mode: 'exam', llm: true }) as any }} />);
    expect(screen.getByText('Exam help')).toBeTruthy();
  });

  it('labels a model answer in general mode as My Nexus', () => {
    wrap(<MessageBubble message={{ id: '2', role: 'assistant', text: 'Your class is at 6.', envelope: env({ llm: true }) as any }} />);
    expect(screen.getByText('My Nexus')).toBeTruthy();
  });

  it('shows no chip on a deterministic reply or on the student\'s own message', () => {
    wrap(<>
      <MessageBubble message={{ id: '3', role: 'assistant', text: 'Your next classes:', envelope: env({}) as any }} />
      <MessageBubble message={{ id: '4', role: 'user', text: 'hi' }} />
    </>);
    expect(screen.queryByText('My Nexus')).toBeNull();
    expect(screen.queryByText('Exam help')).toBeNull();
  });
});
