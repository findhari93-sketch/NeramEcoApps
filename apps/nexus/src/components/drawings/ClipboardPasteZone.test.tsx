import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import ClipboardPasteZone from './ClipboardPasteZone';

function dispatchPaste(type: string, sizebytes = 1024) {
  const blob = new Blob(['x'.repeat(sizebytes)], { type });
  const file = new File([blob], 'image.png', { type });
  const item = { type, getAsFile: () => file } as unknown as DataTransferItem;
  const event = new Event('paste') as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [item] },
  });
  document.dispatchEvent(event);
  return file;
}

describe('ClipboardPasteZone', () => {
  it('renders the paste hint text', () => {
    render(<ClipboardPasteZone onFile={vi.fn()} isUploading={false} />);
    expect(screen.getByText(/paste image here/i)).toBeDefined();
  });

  it('calls onFile when an image is pasted', () => {
    const onFile = vi.fn();
    render(<ClipboardPasteZone onFile={onFile} isUploading={false} />);
    const file = dispatchPaste('image/png');
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('does not call onFile when a non-image is pasted', () => {
    const onFile = vi.fn();
    render(<ClipboardPasteZone onFile={onFile} isUploading={false} />);
    dispatchPaste('text/plain');
    expect(onFile).not.toHaveBeenCalled();
  });

  it('shows error and does not call onFile when pasted image exceeds maxSizeMB', async () => {
    const onFile = vi.fn();
    render(
      <ClipboardPasteZone onFile={onFile} isUploading={false} maxSizeMB={0.000001} />
    );
    dispatchPaste('image/png', 2000);
    expect(onFile).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/under/i)).toBeDefined();
    });
  });

  it('shows uploading state when isUploading is true', () => {
    render(<ClipboardPasteZone onFile={vi.fn()} isUploading={true} />);
    expect(screen.getByText(/uploading/i)).toBeDefined();
  });

  it('renders nothing when disabled', () => {
    const { container } = render(
      <ClipboardPasteZone onFile={vi.fn()} isUploading={false} disabled />
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not call onFile after unmount', () => {
    const onFile = vi.fn();
    const { unmount } = render(<ClipboardPasteZone onFile={onFile} isUploading={false} />);
    unmount();
    dispatchPaste('image/png');
    expect(onFile).not.toHaveBeenCalled();
  });
});
