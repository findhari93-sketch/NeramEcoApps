import { describe, it, expect, vi } from 'vitest';
import { collectScreenshotPaths } from './issue-screenshot-upload';

/**
 * Regression cover for the bug where every auto-captured screenshot reached the
 * storage bucket and none ever reached `screenshot_urls`. The old code resolved
 * the path inside an effect whose own cleanup cancelled the write, so the LATE
 * RESOLVE test below is the one that matters: it fails against any design that
 * needs the component to still be listening when the upload finishes.
 */

const fakeFile = () => new File(['x'], 'auto-screenshot.jpg', { type: 'image/jpeg' });

describe('collectScreenshotPaths', () => {
  it('keeps the auto screenshot even when the upload resolves long after submit began', async () => {
    const upload = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('student-1/999.jpg'), 60)),
    );

    const paths = await collectScreenshotPaths({
      manual: ['student-1/manual.jpg'],
      autoFile: fakeFile(),
      upload,
      timeoutMs: 500,
    });

    expect(paths).toEqual(['student-1/999.jpg', 'student-1/manual.jpg']);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('returns the manual paths untouched when there is no auto capture', async () => {
    const upload = vi.fn();

    const paths = await collectScreenshotPaths({
      manual: ['a.jpg', 'b.jpg'],
      autoFile: null,
      upload,
    });

    expect(paths).toEqual(['a.jpg', 'b.jpg']);
    expect(upload).not.toHaveBeenCalled();
  });

  it('still reports when the upload rejects', async () => {
    const paths = await collectScreenshotPaths({
      manual: ['a.jpg'],
      autoFile: fakeFile(),
      upload: () => Promise.reject(new Error('413 Payload Too Large')),
    });

    expect(paths).toEqual(['a.jpg']);
  });

  it('still reports when the upload returns no path', async () => {
    const paths = await collectScreenshotPaths({
      manual: [],
      autoFile: fakeFile(),
      upload: () => Promise.resolve(null),
    });

    expect(paths).toEqual([]);
  });

  it('gives up on an upload that never settles instead of blocking the report', async () => {
    const paths = await collectScreenshotPaths({
      manual: ['a.jpg'],
      autoFile: fakeFile(),
      upload: () => new Promise<string>(() => {}),
      timeoutMs: 30,
    });

    expect(paths).toEqual(['a.jpg']);
  });

  it('does not attach the same path twice', async () => {
    const paths = await collectScreenshotPaths({
      manual: ['student-1/999.jpg'],
      autoFile: fakeFile(),
      upload: () => Promise.resolve('student-1/999.jpg'),
    });

    expect(paths).toEqual(['student-1/999.jpg']);
  });
});
