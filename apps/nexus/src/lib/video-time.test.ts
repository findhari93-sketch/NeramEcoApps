import { describe, it, expect } from 'vitest';
import { parseVideoTime, formatVideoTime, videoAtTime } from './video-time';

describe('parseVideoTime', () => {
  it('reads minutes and seconds the way a student types them', () => {
    expect(parseVideoTime('2:15')).toBe(135);
    expect(parseVideoTime(' 0:05 ')).toBe(5);
    expect(parseVideoTime('1:02:03')).toBe(3723);
  });

  it('reads plain seconds', () => {
    expect(parseVideoTime('90')).toBe(90);
  });

  it('says nothing for a blank box', () => {
    expect(parseVideoTime('')).toBeNull();
    expect(parseVideoTime('   ')).toBeNull();
  });

  it('refuses what is not a time', () => {
    expect(parseVideoTime('2:75')).toBeUndefined();
    expect(parseVideoTime('abc')).toBeUndefined();
    expect(parseVideoTime('-3')).toBeUndefined();
  });
});

describe('formatVideoTime', () => {
  it('writes it back the same way', () => {
    expect(formatVideoTime(135)).toBe('2:15');
    expect(formatVideoTime(5)).toBe('0:05');
    expect(formatVideoTime(3723)).toBe('1:02:03');
  });
});

describe('videoAtTime', () => {
  it('opens a YouTube video at that moment', () => {
    expect(videoAtTime('https://www.youtube.com/watch?v=U1X9MmLh-ZQ', 135)).toBe(
      'https://www.youtube.com/watch?v=U1X9MmLh-ZQ&t=135s',
    );
  });

  it('leaves other links alone', () => {
    const url = 'https://neram.sharepoint.com/:v:/s/x/video.mp4';
    expect(videoAtTime(url, 135)).toBe(url);
  });
});
