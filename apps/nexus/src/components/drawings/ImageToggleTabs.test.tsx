import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('does not render Reference tab when correctedImageUrl is not provided', () => {
    render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} />);
    expect(screen.queryByRole('button', { name: /Reference/i })).toBeNull();
  });

  it('renders Reference tab when correctedImageUrl is provided', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
      />
    );
    expect(screen.getByRole('button', { name: /Reference/i })).toBeDefined();
  });

  it('switches to corrected image when Reference tab is clicked', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Reference/i }));
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

  it('shows Teacher Reference caption when reference tab is active', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Reference/i }));
    expect(screen.getByText(/Teacher Reference/i)).toBeDefined();
  });
});

const REGIONS = [
  { id: 'r1', x: 10, y: 10, width: 20, height: 20, comment: 'Proportion' },
  { id: 'r2', x: 40, y: 40, width: 15, height: 15, comment: 'Shading' },
];

const rotateBtn = () => screen.getByRole('button', { name: /rotate image 90 degrees/i });

describe('ImageToggleTabs rotation', () => {
  it('hides the rotate control when no onRotate handler is supplied', () => {
    render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode />);
    expect(screen.queryByRole('button', { name: /rotate image/i })).toBeNull();
  });

  it('shows the rotate control once a handler is supplied', () => {
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={vi.fn()} />
    );
    expect(rotateBtn()).toBeDefined();
  });

  it('keeps the confirm bar hidden until the image is actually turned', () => {
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /save rotation/i })).toBeNull();
  });

  it('reveals Save and Cancel after a tap', () => {
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={vi.fn()} />
    );
    fireEvent.click(rotateBtn());
    expect(screen.getByRole('button', { name: /save rotation/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('turns the image on each tap and returns to rest after four', () => {
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={vi.fn()} />
    );
    const img = screen.getByRole('img', { name: /Drawing/i });

    fireEvent.click(rotateBtn());
    expect(img.getAttribute('data-rotation')).toBe('90');
    fireEvent.click(rotateBtn());
    expect(img.getAttribute('data-rotation')).toBe('180');
    fireEvent.click(rotateBtn());
    expect(img.getAttribute('data-rotation')).toBe('270');
    fireEvent.click(rotateBtn());
    expect(img.getAttribute('data-rotation')).toBe('0');
    expect(screen.queryByRole('button', { name: /save rotation/i })).toBeNull();
  });

  it('cancelling puts the image back and dismisses the bar', () => {
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={vi.fn()} />
    );
    fireEvent.click(rotateBtn());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /save rotation/i })).toBeNull();
  });

  it('warns that a quarter turn will clear the teacher marked areas', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        isEditMode
        regionAnnotations={REGIONS}
        onRotate={vi.fn()}
      />
    );
    fireEvent.click(rotateBtn());
    expect(screen.getByText(/clears your 2 marked areas/i)).toBeDefined();
  });

  it('does not warn on a half turn, which leaves the box shape alone', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        isEditMode
        regionAnnotations={REGIONS}
        onRotate={vi.fn()}
      />
    );
    fireEvent.click(rotateBtn());
    fireEvent.click(rotateBtn());
    expect(screen.queryByText(/clears your/i)).toBeNull();
  });

  it('hands the handler the pending turn, the tab, and the clear decision', async () => {
    const onRotate = vi.fn().mockResolvedValue(undefined);
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        isEditMode
        regionAnnotations={REGIONS}
        onRotate={onRotate}
      />
    );
    fireEvent.click(rotateBtn());
    fireEvent.click(screen.getByRole('button', { name: /save rotation/i }));
    await waitFor(() => expect(onRotate).toHaveBeenCalledWith(90, 'original', true));
  });

  it('clears the pending turn once it is saved, so the new image is not double rotated', async () => {
    const onRotate = vi.fn().mockResolvedValue(undefined);
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={onRotate} />
    );
    const img = screen.getByRole('img', { name: /Drawing/i });
    fireEvent.click(rotateBtn());
    fireEvent.click(screen.getByRole('button', { name: /save rotation/i }));

    await waitFor(() => expect(img.getAttribute('data-rotation')).toBe('0'));
    expect(screen.queryByRole('button', { name: /save rotation/i })).toBeNull();
  });

  it('keeps the turn and surfaces the reason when saving fails', async () => {
    const onRotate = vi.fn().mockRejectedValue(new Error('Upload failed while saving the rotation'));
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={onRotate} />
    );
    const img = screen.getByRole('img', { name: /Drawing/i });
    fireEvent.click(rotateBtn());
    fireEvent.click(screen.getByRole('button', { name: /save rotation/i }));

    await waitFor(() => expect(screen.getByText(/upload failed while saving/i)).toBeDefined());
    // The preview must not claim a rotation that was never stored.
    expect(img.getAttribute('data-rotation')).toBe('90');
    expect(screen.getByRole('button', { name: /save rotation/i })).toBeDefined();
  });

  it('suspends the markup tools while a turn is pending', () => {
    render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode onRotate={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /markup tools/i })).toBeDefined();
    fireEvent.click(rotateBtn());
    expect(screen.queryByRole('button', { name: /markup tools/i })).toBeNull();
  });

  it('drops a pending turn when the teacher switches to another image', () => {
    render(
      <ImageToggleTabs
        originalImageUrl={ORIGINAL_URL}
        correctedImageUrl={CORRECTED_URL}
        isEditMode
        onRotate={vi.fn()}
      />
    );
    fireEvent.click(rotateBtn());
    expect(screen.getByRole('button', { name: /save rotation/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Reference/i }));
    expect(screen.queryByRole('button', { name: /save rotation/i })).toBeNull();
  });
});
