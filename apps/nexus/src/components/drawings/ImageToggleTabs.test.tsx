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

// Fractions of the drawing, not percentages of the stage. See
// lib/annotation-geometry.ts for why that distinction is the whole point.
const REGIONS = [
  { id: 'r1', x: 0.1, y: 0.1, width: 0.2, height: 0.2, comment: 'Proportion' },
  { id: 'r2', x: 0.4, y: 0.4, width: 0.15, height: 0.15, comment: 'Shading' },
];

/**
 * jsdom reports every element as 0x0, so the component decides it cannot place
 * an annotation yet. Give the stage and the image real sizes for the tests
 * that care where a rectangle lands.
 *
 * 400 wide by 200 tall inside a 400x400 stage: 100px of letterbox top and
 * bottom, which is exactly the offset the old percentage maths ignored.
 */
function stubLayout({ imgW = 400, imgH = 200, stageW = 400, stageH = 400 } = {}) {
  const proto = window.HTMLElement.prototype;
  const defs: Array<[string, number]> = [
    ['offsetWidth', imgW], ['offsetHeight', imgH],
    ['clientWidth', stageW], ['clientHeight', stageH],
  ];
  const originals = defs.map(([prop]) => [prop, Object.getOwnPropertyDescriptor(proto, prop)] as const);
  for (const [prop, value] of defs) {
    Object.defineProperty(proto, prop, { configurable: true, get: () => value });
  }
  return () => {
    for (const [prop, desc] of originals) {
      if (desc) Object.defineProperty(proto, prop, desc);
      else delete (proto as any)[prop];
    }
  };
}

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

describe('ImageToggleTabs numbered pins (student workspace)', () => {
  it('draws a numbered pin per region, and hands back the one tapped', () => {
    const restore = stubLayout();
    try {
      const onRegionSelect = vi.fn();
      render(
        <ImageToggleTabs
          originalImageUrl={ORIGINAL_URL}
          studentView
          regionAnnotations={REGIONS}
          regionLabels="numbers"
          onRegionSelect={onRegionSelect}
        />
      );
      const pin = screen.getByRole('button', { name: 'Note 2: Shading' });
      expect(pin.textContent).toBe('2');
      // The words live in the list beside the drawing, not on it.
      expect(screen.queryByText('Proportion')).toBeNull();
      fireEvent.click(pin);
      expect(onRegionSelect).toHaveBeenCalledWith('r2');
    } finally {
      restore();
    }
  });

  it('marks the picked region and returns to the drawing tab to show it', () => {
    const restore = stubLayout();
    try {
      const { container, rerender } = render(
        <ImageToggleTabs
          originalImageUrl={ORIGINAL_URL}
          correctedImageUrl={CORRECTED_URL}
          studentView
          regionAnnotations={REGIONS}
          regionLabels="numbers"
          onRegionSelect={vi.fn()}
          tabLabels={{ corrected: 'Corrected' }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Corrected' }));
      expect((screen.getByRole('img', { name: /Drawing/i }) as HTMLImageElement).src).toBe(CORRECTED_URL);

      rerender(
        <ImageToggleTabs
          originalImageUrl={ORIGINAL_URL}
          correctedImageUrl={CORRECTED_URL}
          studentView
          regionAnnotations={REGIONS}
          regionLabels="numbers"
          onRegionSelect={vi.fn()}
          activeRegionId="r1"
          tabLabels={{ corrected: 'Corrected' }}
        />
      );
      expect((screen.getByRole('img', { name: /Drawing/i }) as HTMLImageElement).src).toBe(ORIGINAL_URL);
      expect(container.querySelector('[data-region-id="r1"]')?.getAttribute('data-active')).toBe('true');
      expect(screen.getByRole('button', { name: /Note 1/ }).getAttribute('aria-pressed')).toBe('true');
    } finally {
      restore();
    }
  });

  it('leaves out tabs with nothing behind them, and the group when one is left', () => {
    render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} studentView hideUnavailableTabs hideCopy />);
    expect(screen.queryByRole('button', { name: /Overlay/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /My Drawing/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });

  it('keeps chips for the teacher by default', () => {
    const restore = stubLayout();
    try {
      render(<ImageToggleTabs originalImageUrl={ORIGINAL_URL} regionAnnotations={REGIONS} />);
      expect(screen.getByText('Proportion')).toBeDefined();
      expect(screen.queryByRole('button', { name: /Note 1/ })).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('ImageToggleTabs annotation placement', () => {
  it('positions a region against the drawing, letterbox included', () => {
    const restore = stubLayout();
    try {
      const { container } = render(
        <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode regionAnnotations={REGIONS} />
      );

      const boxes = Array.from(container.querySelectorAll('div')).filter((el) =>
        (el as HTMLElement).style.left.endsWith('px') && (el as HTMLElement).style.width.endsWith('px'),
      ) as HTMLElement[];

      const first = boxes[0];
      expect(first).toBeDefined();
      // x 0.1 of a 400px drawing that starts at stage x 0, and y 0.1 of a
      // 200px drawing that starts 100px down. The 100px is the letterbox the
      // old percentage maths silently folded into the coordinate.
      expect(first.style.left).toBe('40px');
      expect(first.style.top).toBe('120px');
      expect(first.style.width).toBe('80px');
      expect(first.style.height).toBe('40px');
    } finally {
      restore();
    }
  });

  it('puts the same region on the same part of the drawing at a different stage size', () => {
    function leftFractionAt(stageW: number, stageH: number, imgW: number, imgH: number) {
      const restore = stubLayout({ imgW, imgH, stageW, stageH });
      try {
        const { container, unmount } = render(
          <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode regionAnnotations={REGIONS} />
        );
        const box = (Array.from(container.querySelectorAll('div')) as HTMLElement[]).find(
          (el) => el.style.left.endsWith('px') && el.style.width.endsWith('px'),
        )!;
        const left = parseFloat(box.style.left);
        const imageLeft = (stageW - imgW) / 2;
        unmount();
        return (left - imageLeft) / imgW;
      } finally {
        restore();
      }
    }

    // A narrow phone stage and a wide desktop stage showing the same drawing.
    const mobile = leftFractionAt(360, 400, 360, 252);
    const desktop = leftFractionAt(900, 600, 857, 600);

    expect(mobile).toBeCloseTo(0.1, 6);
    expect(desktop).toBeCloseTo(0.1, 6);
  });

  it('draws nothing until the stage has been measured', () => {
    // Without a measurement there is no honest place to put a rectangle, so
    // the layer waits rather than guessing at the stage box.
    const { container } = render(
      <ImageToggleTabs originalImageUrl={ORIGINAL_URL} isEditMode regionAnnotations={REGIONS} />
    );
    const positioned = (Array.from(container.querySelectorAll('div')) as HTMLElement[]).filter(
      (el) => el.style.left.endsWith('px') && el.style.width.endsWith('px'),
    );
    expect(positioned).toHaveLength(0);
  });
});
