import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AiStatusLine from './AiStatusLine';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

describe('AiStatusLine', () => {
  it('renders nothing before the status loads', () => {
    const { container } = render(<AiStatusLine status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the count when on, with no button', () => {
    render(<AiStatusLine status={{ on: true, reason: 'caught_up', sentence: 'AI answers: on, 7 left today.', link: null, left_today: 7, daily_limit: 10 }} />);
    expect(screen.getByRole('status').textContent).toContain('AI answers: on, 7 left today.');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the reason and a Catch-up button when off', () => {
    render(<AiStatusLine status={{ on: false, reason: 'missed_class', sentence: 'AI answers are off. Catch up on Perspective (1 Oct) to switch them back on.', link: { label: 'Catch-up', url: '/student/catch-up' }, left_today: 10, daily_limit: 10 }} />);
    expect(screen.getByRole('link', { name: 'Catch-up' }).getAttribute('href')).toBe('/student/catch-up');
  });
});
