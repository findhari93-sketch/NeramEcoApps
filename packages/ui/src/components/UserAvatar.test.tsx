import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { UserAvatar } from './UserAvatar';

const SRC = 'https://example.com/photo.jpg';

function avatarEl(container: HTMLElement): Element {
  return container.querySelector('.MuiAvatar-root')!;
}

describe('UserAvatar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows initials (first + last) and no image when there is no photo', () => {
    const { container } = render(<UserAvatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the photo when src is provided', () => {
    const { container } = render(<UserAvatar name="John Doe" src={SRC} />);
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toBe(SRC);
  });

  it('opens the enlarged viewer when a photo avatar is tapped (tapToView default)', () => {
    const { container } = render(<UserAvatar name="John Doe" src={SRC} />);
    expect(screen.queryByLabelText('Close photo')).toBeNull();

    fireEvent.click(avatarEl(container));

    expect(screen.getByLabelText('Close photo')).toBeDefined();
    const enlarged = screen.getByRole('img', { name: 'John Doe' }) as HTMLImageElement;
    expect(enlarged.src).toBe(SRC);
  });

  it('does NOT open on tap when tapToView is false, but right-click (contextmenu) does', () => {
    const { container } = render(<UserAvatar name="John Doe" src={SRC} tapToView={false} />);

    // A plain tap must fall through to the parent action, not open the viewer.
    fireEvent.click(avatarEl(container));
    expect(screen.queryByLabelText('Close photo')).toBeNull();

    // Right-click / long-press callout opens the viewer.
    fireEvent.contextMenu(avatarEl(container));
    expect(screen.getByLabelText('Close photo')).toBeDefined();
  });

  it('opens on long-press even when tapToView is false', () => {
    vi.useFakeTimers();
    const { container } = render(<UserAvatar name="John Doe" src={SRC} tapToView={false} />);

    fireEvent.pointerDown(avatarEl(container), { clientX: 0, clientY: 0 });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByLabelText('Close photo')).toBeDefined();
  });

  it('does not open the viewer when clickable is false', () => {
    const { container } = render(<UserAvatar name="John Doe" src={SRC} clickable={false} />);
    fireEvent.click(avatarEl(container));
    fireEvent.contextMenu(avatarEl(container));
    expect(screen.queryByLabelText('Close photo')).toBeNull();
  });

  it('is not clickable when there is no photo', () => {
    const { container } = render(<UserAvatar name="John Doe" />);
    fireEvent.click(avatarEl(container));
    fireEvent.contextMenu(avatarEl(container));
    expect(screen.queryByLabelText('Close photo')).toBeNull();
  });

  it('falls back to a single initial for one-word names', () => {
    render(<UserAvatar name="Madonna" />);
    expect(screen.getByText('M')).toBeDefined();
  });
});
