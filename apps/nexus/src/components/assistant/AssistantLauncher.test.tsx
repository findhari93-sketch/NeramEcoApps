import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from '@neram/ui';
import AssistantLauncher from './AssistantLauncher';

let pathname = '/student/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const ctx: { enabled: boolean; open: boolean; openPanel: () => void } = { enabled: true, open: false, openPanel: vi.fn() };
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => ctx }));

beforeEach(() => {
  ctx.enabled = true;
  ctx.open = false;
  ctx.openPanel = vi.fn();
  pathname = '/student/dashboard';
});

/** The launcher next to a real MUI drawer, wired the way the provider wires them. */
function Harness() {
  const [open, setOpen] = useState(false);
  ctx.open = open;
  ctx.openPanel = () => setOpen(true);
  return (
    <>
      <AssistantLauncher />
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <button type="button">Inside the panel</button>
      </Drawer>
    </>
  );
}

describe('AssistantLauncher', () => {
  it('renders one labelled, screenshot-excluded button and opens the panel', () => {
    const openPanel = vi.fn();
    ctx.openPanel = openPanel;
    render(<AssistantLauncher />);
    const btn = screen.getByRole('button', { name: 'Open Neram Assistant' });
    expect(btn.getAttribute('data-no-screenshot')).toBe('true');
    btn.click();
    expect(openPanel).toHaveBeenCalled();
  });
  it('hides on the sketchbook page, which has its own button', () => {
    pathname = '/student/sketchbook';
    render(<AssistantLauncher />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('hides while the panel is open, staying mounted so focus can come back to it', () => {
    ctx.open = true;
    const { unmount } = render(<AssistantLauncher />);
    // Out of sight and out of the accessibility tree...
    expect(screen.queryByRole('button')).toBeNull();
    // ...but still in the DOM, so the drawer can hand focus back on close.
    expect(screen.queryByLabelText('Open Neram Assistant')).not.toBeNull();
    unmount();
  });
  it('renders nothing when the assistant is not enabled', () => {
    ctx.enabled = false;
    render(<AssistantLauncher />);
    expect(screen.queryByLabelText('Open Neram Assistant')).toBeNull();
  });
  it('returns focus to the launcher when the panel closes', async () => {
    render(<Harness />);
    const btn = screen.getByRole('button', { name: 'Open Neram Assistant' });
    act(() => btn.focus());
    expect(document.activeElement).toBe(btn);
    fireEvent.click(btn);
    // The drawer's focus trap has taken focus.
    expect(document.activeElement).not.toBe(btn);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await act(async () => {});
    expect(document.activeElement).toBe(btn);
  });
});
