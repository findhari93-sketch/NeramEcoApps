import { describe, it, expect } from 'vitest';
import { extractYouTubeId, isValidYouTubeUrl } from './youtube';

describe('extractYouTubeId', () => {
  it('reads the id from a youtu.be short link', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('reads the id from a watch URL with extra params', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=abc')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('reads the id from an embed / nocookie URL', () => {
    expect(extractYouTubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('reads the id from a shorts / live / m. URL', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a bare 11-char id', () => {
    expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects non-YouTube and malformed input', () => {
    expect(extractYouTubeId('https://vimeo.com/12345')).toBeNull();
    expect(extractYouTubeId('https://teams.microsoft.com/l/meetingrecap?x=1')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
    expect(extractYouTubeId(null)).toBeNull();
    expect(extractYouTubeId(undefined)).toBeNull();
  });
});

describe('isValidYouTubeUrl', () => {
  it('is true for valid links and false otherwise', () => {
    expect(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isValidYouTubeUrl('https://example.com')).toBe(false);
  });
});
