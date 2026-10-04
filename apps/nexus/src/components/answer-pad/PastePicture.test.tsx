import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PastePicture, { pictureFrom } from './PastePicture';

const png = () => new File([new Uint8Array(8)], 'snip.png', { type: 'image/png' });

/** A clipboard as the browser hands it to a paste event. */
function clipboard(opts: { files?: File[]; items?: Array<{ kind: string; type: string; getAsFile: () => File | null }>; text?: string }) {
  return { files: opts.files ?? [], items: opts.items ?? [], getData: (type: string) => (type === 'text/plain' ? (opts.text ?? '') : '') } as unknown as DataTransfer;
}

function paste(target: EventTarget, data: DataTransfer): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

let upload: Mock<[File], Promise<{ url: string }>>;
let onChange: Mock<[string | null], void>;
let onPasted: Mock<[string], void>;

beforeEach(() => {
  upload = vi.fn(async (_file: File) => ({ url: 'https://cdn.test/q.jpg' }));
  onChange = vi.fn<[string | null], void>();
  onPasted = vi.fn<[string], void>();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

function ui(props: Partial<Parameters<typeof PastePicture>[0]> = {}) {
  return (
    <>
      <label>
        Question
        <textarea aria-label="Question text" />
      </label>
      <PastePicture value={null} onChange={onChange} upload={upload} busy={false} questionTitle="Q.33" onPasted={onPasted} {...props} />
    </>
  );
}

function setup(props: Partial<Parameters<typeof PastePicture>[0]> = {}) {
  return render(ui(props));
}

describe('pictureFrom', () => {
  it('finds an image in the files, then in the items, and nothing in text', () => {
    const file = png();
    expect(pictureFrom(clipboard({ files: [file] }))).toBe(file);
    expect(pictureFrom(clipboard({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }))).toBe(file);
    expect(pictureFrom(clipboard({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], text: 'hi' }))).toBeNull();
    expect(pictureFrom(null)).toBeNull();
  });
});

describe('PastePicture', () => {
  it('takes Ctrl + V anywhere in the pad, not only in the box', async () => {
    setup();
    const event = paste(document.body, clipboard({ files: [png()] }));
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.test/q.jpg'));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onPasted).toHaveBeenCalledWith('https://cdn.test/q.jpg');
  });

  it('leaves text pasted into a text field alone', () => {
    setup();
    const event = paste(screen.getByLabelText('Question text'), clipboard({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], text: 'Q 33' }));
    expect(event.defaultPrevented).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('takes a picture pasted while the cursor is in a text field', async () => {
    setup();
    paste(screen.getByLabelText('Question text'), clipboard({ files: [png()] }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('holds a paste that arrives while another action runs, and takes it after', async () => {
    const { rerender } = setup({ busy: true });
    paste(document.body, clipboard({ files: [png()] }));
    expect(upload).not.toHaveBeenCalled();
    rerender(ui({ busy: false }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it('says to click first when the pad does not have focus, and clicking the box focuses it without a file picker', () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    setup();
    expect(screen.getByText('Click here, then press Ctrl + V')).toBeTruthy();

    vi.mocked(document.hasFocus).mockReturnValue(true);
    const box = screen.getByRole('button', { name: /Picture for Q\.33/ });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    fireEvent.click(box);
    fireEvent.focus(window);
    expect(document.activeElement).toBe(box);
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByText('Press Ctrl + V to paste the picture for Q.33')).toBeTruthy();
  });

  it('refuses something that is not a picture, or is too big, with a message', async () => {
    setup();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('That is not a picture');

    const big = new File([new Uint8Array(1)], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    paste(document.body, clipboard({ files: [big] }));
    expect((await screen.findByRole('alert')).textContent).toContain('over 10 MB');
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows the upload's own message when it fails", async () => {
    upload.mockRejectedValueOnce(new Error('This picture type can’t be used. Snip it again or save it as PNG.'));
    setup();
    paste(document.body, clipboard({ files: [png()] }));
    expect((await screen.findByRole('alert')).textContent).toContain('Snip it again or save it as PNG');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the picture once added, with a way to remove it', () => {
    setup({ value: 'https://cdn.test/q.jpg' });
    expect(screen.getByRole('img', { name: 'Picture for Q.33' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the picture' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("uses Teams' own clipboard where the client has one", async () => {
    const blob = new Blob([new Uint8Array(4)], { type: 'image/png' });
    setup({ readClipboard: async () => blob });
    fireEvent.click(screen.getByRole('button', { name: 'Paste the picture from the clipboard' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });

  it('stops listening once it is gone', () => {
    const { unmount } = setup();
    unmount();
    const event = paste(document.body, clipboard({ files: [png()] }));
    expect(event.defaultPrevented).toBe(false);
  });
});
