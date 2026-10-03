import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Composer from './Composer';

const upload = vi.fn(async () => ({ original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: null }));

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn(async () => undefined);
  render(<Composer onSend={onSend} busy={false} wantsAttachment={false} draft="" onDraftConsumed={() => {}} upload={upload} {...props} />);
  return { onSend };
}

beforeEach(() => upload.mockClear());

describe('Composer', () => {
  it('sends on Enter and keeps Shift+Enter as a newline', async () => {
    const { onSend } = setup();
    const box = screen.getByRole('textbox', { name: 'Message Neram Assistant' });
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello', null));
  });

  it('refuses a non-image file before uploading and keeps the typed text', async () => {
    const { onSend } = setup();
    const box = screen.getByRole('textbox', { name: 'Message Neram Assistant' }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'my sketch' } });
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/Only photos can be attached/)).not.toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(box.value).toBe('my sketch');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('refuses a file over 12 MB', async () => {
    setup();
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    const big = new File([new Uint8Array(1)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 13 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/smaller than 12 MB/)).not.toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('offers camera and gallery: accepts images and does not force the camera', () => {
    setup();
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.hasAttribute('capture')).toBe(false);
  });

  it('uploads an image, shows it, and sends it with the text', async () => {
    const { onSend } = setup();
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(await screen.findByAltText('Attached sketch')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: null }));
  });

  it('the message box is at least 48px tall with 16px text', () => {
    setup();
    const box = screen.getByRole('textbox', { name: 'Message Neram Assistant' });
    const root = box.closest('.MuiInputBase-root') as HTMLElement;
    expect(getComputedStyle(root).minHeight).toBe('48px');
    expect(box.style.fontSize).toBe('16px');
  });

  it('Edit seeds an empty box but never overwrites what the student typed', () => {
    const { rerender } = render(<Composer onSend={vi.fn(async () => undefined)} busy={false} wantsAttachment={false} draft="" onDraftConsumed={() => {}} upload={upload} />);
    const box = screen.getByRole('textbox', { name: 'Message Neram Assistant' }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'make it Friday' } });
    rerender(<Composer onSend={vi.fn(async () => undefined)} busy={false} wantsAttachment={false} draft="Change: " onDraftConsumed={() => {}} upload={upload} />);
    expect(box.value).toBe('make it Friday');
    fireEvent.change(box, { target: { value: '' } });
    rerender(<Composer onSend={vi.fn(async () => undefined)} busy={false} wantsAttachment={false} draft="" onDraftConsumed={() => {}} upload={upload} />);
    rerender(<Composer onSend={vi.fn(async () => undefined)} busy={false} wantsAttachment={false} draft="Change: " onDraftConsumed={() => {}} upload={upload} />);
    expect(box.value).toBe('Change: ');
  });

  it('empties the picker after a refused file, so picking the same file again still fires', async () => {
    setup();
    const input = screen.getByTestId('assistant-file-input') as HTMLInputElement;
    // jsdom keeps a file input's value empty, so record the reset instead.
    const cleared: string[] = [];
    Object.defineProperty(input, 'value', { configurable: true, get: () => 'C:/fakepath/notes.pdf', set: (v: string) => { cleared.push(v); } });
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/Only photos can be attached/)).not.toBeNull();
    expect(cleared).toContain('');
  });

  it('send and attach buttons are at least 48px', () => {
    setup();
    for (const name of ['Send', 'Attach a photo']) {
      const b = screen.getByRole('button', { name });
      expect(b.className).toMatch(/MuiIconButton/);
      expect(getComputedStyle(b).minHeight === '48px' || b.getAttribute('data-size') === '48').toBe(true);
    }
  });
});
