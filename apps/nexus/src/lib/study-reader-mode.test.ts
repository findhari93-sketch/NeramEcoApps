import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  READER_MODE_STORAGE_KEY,
  initialReaderView,
  parseReaderMode,
  readReaderMode,
  writeReaderMode,
} from './study-reader-mode';

describe('parseReaderMode', () => {
  it('reads slides and treats anything else as the PDF', () => {
    expect(parseReaderMode('slides')).toBe('slides');
    expect(parseReaderMode('pdf')).toBe('pdf');
    expect(parseReaderMode(null)).toBe('pdf');
    expect(parseReaderMode('Slides')).toBe('pdf');
  });
});

describe('remembered reader mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on the PDF', () => {
    expect(readReaderMode()).toBe('pdf');
  });

  it('remembers slides once chosen', () => {
    writeReaderMode('slides');
    expect(window.localStorage.getItem(READER_MODE_STORAGE_KEY)).toBe('slides');
    expect(readReaderMode()).toBe('slides');
  });

  it('falls back to the PDF when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readReaderMode()).toBe('pdf');
  });

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeReaderMode('slides')).not.toThrow();
  });
});

describe('initialReaderView', () => {
  it('opens a chapter with slides on the remembered view', () => {
    expect(initialReaderView(true, 'slides')).toBe('slides');
    expect(initialReaderView(true, 'pdf')).toBe('pdf');
  });

  it('opens a chapter without slides on its PDF whatever was chosen', () => {
    expect(initialReaderView(false, 'slides')).toBe('pdf');
  });
});
