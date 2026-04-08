import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import ImageToggleTabs from './ImageToggleTabs';

const ORIGINAL_URL = 'https://example.com/original.jpg';
const OVERLAY_URL = 'https://example.com/overlay.jpg';
const CORRECTED_URL = 'https://example.com/corrected.jpg';

const ANNOTATIONS = [
  { area: 'top-left', label: 'Proportion off', severity: 'high' as const },
  { area: 'center', label: 'Good shading', severity: 'low' as const },
];

describe('ImageToggleTabs', () => {
  it('renders My Drawing tab active by default', () => {
    render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} />);
    const img = screen.getByRole('img', { name: /Drawing/i });
    expect((img as HTMLImageElement).src).toBe(ORIGINAL_URL);
  });

  it('disables Overlay tab when no annotations and no overlayImageUrl', () => {
    render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} />);
    const overlayBtn = screen.getByRole('button', { name: /Overlay/i });
    expect(overlayBtn.hasAttribute('disabled')).toBe(true);
  });

  it('enables Overlay tab when annotations are provided', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        overlayAnnotations={ANNOTATIONS}
      />
    );
    const overlayBtn = screen.getByRole('button', { name: /Overlay/i });
    expect(overlayBtn.hasAttribute('disabled')).toBe(false);
  });

  it('enables Overlay tab when overlayImageUrl is provided', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        overlayImageUrl={OVERLAY_URL}
      />
    );
    const overlayBtn = screen.getByRole('button', { name: /Overlay/i });
    expect(overlayBtn.hasAttribute('disabled')).toBe(false);
  });

  it('does not render Corrected tab when correctedImageUrl is not provided', () => {
    render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} />);
    expect(screen.queryByRole('button', { name: /Corrected/i })).toBeNull();
  });

  it('renders Corrected tab when correctedImageUrl is provided', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
      />
    );
    expect(screen.getByRole('button', { name: /Corrected/i })).toBeDefined();
  });

  it('switches to corrected image when Corrected tab is clicked', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Corrected/i }));
    const img = screen.getByRole('img', { name: /Drawing/i });
    expect((img as HTMLImageElement).src).toBe(CORRECTED_URL);
  });

  it('switches to overlay image (overlayImageUrl) when Overlay tab is clicked', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        overlayImageUrl={OVERLAY_URL}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Overlay/i }));
    const img = screen.getByRole('img', { name: /Drawing/i });
    expect((img as HTMLImageElement).src).toBe(OVERLAY_URL);
  });

  it('shows annotation chips in overlay tab when overlayImageUrl is absent', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        overlayAnnotations={ANNOTATIONS}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Overlay/i }));
    expect(screen.getByText('Proportion off')).toBeDefined();
    expect(screen.getByText('Good shading')).toBeDefined();
  });

  it('does not show annotation chips when overlayImageUrl is present (image takes priority)', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        overlayAnnotations={ANNOTATIONS}
        overlayImageUrl={OVERLAY_URL}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Overlay/i }));
    // When overlayImageUrl exists, image is shown not floating chips
    expect(screen.queryByText('Proportion off')).toBeNull();
  });

  it('shows Corrected Reference caption when corrected tab is active', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Corrected/i }));
    expect(screen.getByText(/Corrected Reference/i)).toBeDefined();
  });
});
