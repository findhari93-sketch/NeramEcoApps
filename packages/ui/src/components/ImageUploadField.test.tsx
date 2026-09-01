import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ImageUploadField } from './ImageUploadField';

/**
 * The Paste button is the only image path that exists on a phone, so these
 * tests are mostly about the ways it is allowed to fail: a browser that cannot
 * read the clipboard, a clipboard with nothing in it, and a denied permission.
 * In every one of those the field must say so rather than quietly opening the
 * file dialog, which is what makes a paste tap read as a bug.
 */

const PNG = 'image/png';

function stubClipboard(read: (() => Promise<unknown[]>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: read ? { read } : {},
  });
}

/** One ClipboardItem-shaped object holding a single image. */
function imageItem(type = PNG) {
  return {
    types: [type],
    getType: async () => new Blob(['x'], { type }),
  };
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  vi.restoreAllMocks();
});

describe('ImageUploadField paste button', () => {
  it('is hidden when the browser cannot read the clipboard', async () => {
    stubClipboard(undefined);
    render(<ImageUploadField value={null} onChange={() => {}} upload={vi.fn()} />);

    // The effect that feature-detects runs on mount, so wait a tick before
    // concluding the button is absent rather than merely not rendered yet.
    await waitFor(() => expect(screen.getByText(/drop, or choose/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /paste/i })).toBeNull();
  });

  it('uploads the image on the clipboard, without opening the file picker', async () => {
    stubClipboard(async () => [imageItem()]);
    const upload = vi.fn().mockResolvedValue({ url: 'https://cdn.test/pasted.png' });
    const onChange = vi.fn();

    const { container } = render(
      <ImageUploadField value={null} onChange={onChange} upload={upload} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const button = await screen.findByRole('button', { name: /paste/i });
    button.click();

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBeInstanceOf(File);
    expect((upload.mock.calls[0][0] as File).type).toBe(PNG);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.test/pasted.png'));
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('says the clipboard is empty instead of uploading nothing', async () => {
    stubClipboard(async () => [{ types: ['text/plain'], getType: async () => new Blob() }]);
    const upload = vi.fn();

    render(<ImageUploadField value={null} onChange={() => {}} upload={upload} />);
    (await screen.findByRole('button', { name: /paste/i })).click();

    await waitFor(() =>
      expect(screen.getByText('Nothing to paste. Copy an image first.')).toBeTruthy(),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('offers the other two paths when clipboard permission is denied', async () => {
    stubClipboard(async () => {
      throw new DOMException('Read permission denied.', 'NotAllowedError');
    });
    const upload = vi.fn();

    render(<ImageUploadField value={null} onChange={() => {}} upload={upload} />);
    (await screen.findByRole('button', { name: /paste/i })).click();

    await waitFor(() =>
      expect(
        screen.getByText('Clipboard access was blocked. Drop the image here, or choose a file.'),
      ).toBeTruthy(),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a pasted image over the size limit before uploading it', async () => {
    const big = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: PNG });
    stubClipboard(async () => [{ types: [PNG], getType: async () => big }]);
    const upload = vi.fn();

    render(
      <ImageUploadField value={null} onChange={() => {}} upload={upload} maxSizeMB={2} />,
    );
    (await screen.findByRole('button', { name: /paste/i })).click();

    await waitFor(() => expect(screen.getByText('File must be under 2 MB.')).toBeTruthy());
    expect(upload).not.toHaveBeenCalled();
  });
});
