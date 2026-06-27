import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UserAvatar } from './UserAvatar';

const SRC = 'https://example.com/photo.jpg';

describe('UserAvatar', () => {
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

  it('opens the enlarged viewer when a photo avatar is clicked', () => {
    const { container } = render(<UserAvatar name="John Doe" src={SRC} />);
    // Not open initially
    expect(screen.queryByLabelText('Close photo')).toBeNull();

    fireEvent.click(container.querySelector('.MuiAvatar-root')!);

    // Dialog open: has a close button and an enlarged image named after the person
    expect(screen.getByLabelText('Close photo')).toBeDefined();
    const enlarged = screen.getByRole('img', { name: 'John Doe' }) as HTMLImageElement;
    expect(enlarged.src).toBe(SRC);
  });

  it('does not open the viewer when clickable is false', () => {
    const { container } = render(<UserAvatar name="John Doe" src={SRC} clickable={false} />);
    fireEvent.click(container.querySelector('.MuiAvatar-root')!);
    expect(screen.queryByLabelText('Close photo')).toBeNull();
  });

  it('is not clickable when there is no photo', () => {
    const { container } = render(<UserAvatar name="John Doe" />);
    fireEvent.click(container.querySelector('.MuiAvatar-root')!);
    expect(screen.queryByLabelText('Close photo')).toBeNull();
  });

  it('falls back to a single initial for one-word names', () => {
    render(<UserAvatar name="Madonna" />);
    expect(screen.getByText('M')).toBeDefined();
  });
});
