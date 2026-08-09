import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyText, downloadText } from './clipboard';

/**
 * These pin the reported failure: Chrome rejects `writeText` with "Document is
 * not focused" when the click handler awaited a fetch first. Before this helper
 * the tagging assistant's Copy prompt button just died there with no fallback
 * and no file, so the teacher had no way to get the prompt out of the app.
 */
describe('copyText', () => {
  const originalClipboard = navigator.clipboard;

  function setClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    document.execCommand = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    setClipboard(originalClipboard);
    vi.restoreAllMocks();
  });

  it('uses the async clipboard when the browser allows it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the document is not focused', async () => {
    const writeText = vi.fn().mockRejectedValue(
      new DOMException("Document is not focused.", 'NotAllowedError'),
    );
    setClipboard({ writeText });

    expect(await copyText('hello')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back when the clipboard API is missing entirely', async () => {
    setClipboard(undefined);

    expect(await copyText('hello')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports false when both routes fail, so the caller can offer a download', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('nope')) });
    document.execCommand = vi.fn().mockReturnValue(false);

    expect(await copyText('hello')).toBe(false);
  });

  it('leaves no scratch textarea behind after the fallback', async () => {
    setClipboard(undefined);
    await copyText('hello');

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('downloadText', () => {
  it('names the file and revokes the object URL it created', () => {
    const url = 'blob:test';
    const createObjectURL = vi.fn().mockReturnValue(url);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadText('prompt.txt', 'body');

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    // Not revoking would leak the blob for the lifetime of the document.
    expect(revokeObjectURL).toHaveBeenCalledWith(url);

    vi.unstubAllGlobals();
    click.mockRestore();
  });
});
