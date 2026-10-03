import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantLauncher from './AssistantLauncher';

let pathname = '/student/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const ctx = { enabled: true, open: false, openPanel: vi.fn() };
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => ctx }));

beforeEach(() => {
  ctx.enabled = true;
  ctx.open = false;
  pathname = '/student/dashboard';
});

describe('AssistantLauncher', () => {
  it('renders one labelled, screenshot-excluded button and opens the panel', () => {
    render(<AssistantLauncher />);
    const btn = screen.getByRole('button', { name: 'Open Neram Assistant' });
    expect(btn.getAttribute('data-no-screenshot')).toBe('true');
    btn.click();
    expect(ctx.openPanel).toHaveBeenCalled();
  });
  it('hides on the sketchbook page, which has its own button', () => {
    pathname = '/student/sketchbook';
    render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('hides while the panel is open and when the assistant is not enabled', () => {
    ctx.open = true;
    const { unmount } = render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    ctx.open = false;
    ctx.enabled = false;
    render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
