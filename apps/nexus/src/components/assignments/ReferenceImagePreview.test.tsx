import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import ReferenceImagePreview from './ReferenceImagePreview';
import StageViewerDialog from './workspace/StageViewerDialog';

/** jsdom has no layout, so give the image and its box the sizes a phone would. */
function fakeLoad(img: HTMLImageElement, { natural, rendered, box }: { natural: [number, number]; rendered: number; box: number }) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: natural[0] });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: natural[1] });
  Object.defineProperty(img, 'offsetHeight', { configurable: true, value: rendered });
  Object.defineProperty(img.parentElement!, 'clientHeight', { configurable: true, value: box });
  fireEvent.load(img);
}

describe('ReferenceImagePreview', () => {
  it('opens the viewer with its image when tapped', () => {
    const onOpen = vi.fn();
    render(<ReferenceImagePreview src="https://x/ref.jpg" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the reference image' }));
    expect(onOpen).toHaveBeenCalledWith('https://x/ref.jpg');
  });

  it('says there is more only when a tall image runs past the cap', () => {
    const { container, unmount } = render(<ReferenceImagePreview src="https://x/tall.jpg" onOpen={vi.fn()} />);
    expect(screen.getByText('Full screen')).toBeDefined();
    // A 1:6 poster at 343px wide renders ~2000px tall in a 420px box.
    fakeLoad(container.querySelector('img')!, { natural: [600, 3600], rendered: 2058, box: 420 });
    expect(screen.getByText('See full image')).toBeDefined();
    unmount();

    const photo = render(<ReferenceImagePreview src="https://x/photo.jpg" onOpen={vi.fn()} />);
    fakeLoad(photo.container.querySelector('img')!, { natural: [1200, 900], rendered: 257, box: 257 });
    expect(screen.queryByText('See full image')).toBeNull();
  });
});

describe('StageViewerDialog', () => {
  it('toggles zoom and closes', () => {
    const onClose = vi.fn();
    render(<StageViewerDialog src="https://x/tall.jpg" alt="Reference image, full screen" onClose={onClose} />);
    const zoom = screen.getByRole('button', { name: 'Zoom in on the image' });
    expect(zoom.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(zoom);
    expect(screen.getByRole('button', { name: 'Fit the image to the screen' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close full screen view' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing without an image', () => {
    render(<StageViewerDialog src={null} alt="x" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
