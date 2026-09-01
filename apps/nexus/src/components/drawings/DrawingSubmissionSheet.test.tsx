import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const compressImage = vi.fn();
vi.mock('@/utils/imageCompression', () => ({
  compressImage: (...args: unknown[]) => compressImage(...args),
}));

import DrawingSubmissionSheet from './DrawingSubmissionSheet';

const getToken = vi.fn(async () => 'test-token');
const onSubmitted = vi.fn();
const onClose = vi.fn();

function renderSheet() {
  return render(
    <DrawingSubmissionSheet
      open
      onClose={onClose}
      sourceType="free_practice"
      getToken={getToken}
      onSubmitted={onSubmitted}
    />,
  );
}

/**
 * Put a file through the hidden input the Camera/Gallery buttons drive.
 * Queried off the document, not the render container: the sheet is a MUI
 * Drawer, so its contents live in a portal.
 */
function selectFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('file input not found');
  const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

const okJson = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

beforeEach(() => {
  compressImage.mockReset();
  compressImage.mockResolvedValue(new File(['out'], 'drawing.jpg', { type: 'image/jpeg' }));
  getToken.mockClear();
  onSubmitted.mockClear();

  // jsdom implements neither of these.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:preview');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/upload')
        ? okJson({ url: 'https://storage.example/rotated.jpg' })
        : okJson({ submission: { id: 'sub-1' } }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DrawingSubmissionSheet rotation', () => {
  it('offers no rotate controls until an image is chosen', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: /rotate right/i })).toBeNull();
  });

  it('offers both directions once an image is chosen', () => {
    renderSheet();
    selectFile();
    expect(screen.getByRole('button', { name: /rotate right/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /rotate left/i })).toBeDefined();
  });

  it('submits with no rotation when the student does not turn the photo', async () => {
    renderSheet();
    selectFile();

    fireEvent.click(screen.getByRole('button', { name: /submit drawing/i }));

    await waitFor(() => expect(compressImage).toHaveBeenCalled());
    expect(compressImage.mock.calls[0][4]).toBe(0);
  });

  it('bakes a clockwise turn into the uploaded file', async () => {
    renderSheet();
    selectFile();

    fireEvent.click(screen.getByRole('button', { name: /rotate right/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit drawing/i }));

    await waitFor(() => expect(compressImage).toHaveBeenCalled());
    expect(compressImage.mock.calls[0][4]).toBe(90);
  });

  it('bakes a counter-clockwise turn as 270', async () => {
    renderSheet();
    selectFile();

    fireEvent.click(screen.getByRole('button', { name: /rotate left/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit drawing/i }));

    await waitFor(() => expect(compressImage).toHaveBeenCalled());
    expect(compressImage.mock.calls[0][4]).toBe(270);
  });

  it('still uploads the untouched file when encoding fails and nothing was turned', async () => {
    compressImage.mockRejectedValue(new Error('decode failed'));
    renderSheet();
    selectFile();

    fireEvent.click(screen.getByRole('button', { name: /submit drawing/i }));

    // The raw file is a fine fallback while the photo is already upright.
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it('refuses to upload rather than silently discard a turn it could not apply', async () => {
    compressImage.mockRejectedValue(new Error('decode failed'));
    renderSheet();
    selectFile();

    fireEvent.click(screen.getByRole('button', { name: /rotate right/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit drawing/i }));

    await waitFor(() => expect(screen.getByText(/could not rotate this image/i)).toBeDefined());
    // Uploading the original here would send the sideways photo anyway.
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('drops the pending turn when the student swaps the image', async () => {
    renderSheet();
    selectFile();

    fireEvent.click(screen.getByRole('button', { name: /rotate right/i }));
    fireEvent.click(screen.getByRole('button', { name: /change image/i }));

    // Back to the empty picker, so the next photo starts unturned.
    expect(screen.queryByRole('button', { name: /rotate right/i })).toBeNull();

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: /submit drawing/i }));
    await waitFor(() => expect(compressImage).toHaveBeenCalled());
    expect(compressImage.mock.calls[0][4]).toBe(0);
  });
});
