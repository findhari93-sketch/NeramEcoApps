import { describe, expect, it } from 'vitest';
import { classifySolutionVideo, sameSolutionVideo, storedSolutionVideo } from './solution-video';

/**
 * What a pasted solution-video link is, and what gets stored.
 *
 * Every YouTube shape a teacher actually copies is reduced to one canonical
 * watch URL, so the student player (and anything else that parses the column)
 * never meets a tracking parameter, a stray space or a Shorts path it cannot
 * read.
 */

const CANONICAL = 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ';

describe('classifySolutionVideo', () => {
  it.each([
    'https://youtu.be/U1X9MmLh-ZQ',
    'https://youtu.be/U1X9MmLh-ZQ?si=AbCdEfGh123',
    'https://www.youtube.com/watch?v=U1X9MmLh-ZQ',
    'https://www.youtube.com/watch?feature=share&v=U1X9MmLh-ZQ',
    'https://m.youtube.com/watch?v=U1X9MmLh-ZQ',
    'https://youtube.com/shorts/U1X9MmLh-ZQ',
    'https://www.youtube.com/embed/U1X9MmLh-ZQ',
    '  https://youtu.be/U1X9MmLh-ZQ  ',
  ])('reads %s as one YouTube video', (raw) => {
    expect(classifySolutionVideo(raw)).toEqual({ kind: 'youtube', id: 'U1X9MmLh-ZQ', url: CANONICAL });
  });

  it('keeps a SharePoint or OneDrive link as it was pasted, trimmed', () => {
    const sp = 'https://neramclasses.sharepoint.com/:v:/s/Videos/EabcDEF?e=xyz';
    expect(classifySolutionVideo(`${sp} `)).toEqual({ kind: 'sharepoint', url: sp });
    expect(classifySolutionVideo('https://1drv.ms/v/s!Abc').kind).toBe('sharepoint');
  });

  it('reads blank as no video, so clearing a field removes the link', () => {
    expect(classifySolutionVideo('')).toEqual({ kind: 'empty' });
    expect(classifySolutionVideo('   ')).toEqual({ kind: 'empty' });
    expect(classifySolutionVideo(null)).toEqual({ kind: 'empty' });
  });

  it.each([
    'abc123',
    'https://vimeo.com/12345',
    'https://youtube.com/channel/UC123',
    'Q no 31 - JEE 2015 Solution Video',
    'javascript:alert(1)',
  ])('refuses %s', (raw) => {
    expect(classifySolutionVideo(raw).kind).toBe('invalid');
  });

  it('accepts a bare 11 character id, the one thing a YouTube link is built on', () => {
    expect(classifySolutionVideo('U1X9MmLh-ZQ')).toEqual({ kind: 'youtube', id: 'U1X9MmLh-ZQ', url: CANONICAL });
  });
});

describe('sameSolutionVideo', () => {
  it('matches two spellings of one YouTube video', () => {
    expect(sameSolutionVideo('https://youtu.be/U1X9MmLh-ZQ?si=x', CANONICAL)).toBe(true);
  });

  it('tells different videos apart', () => {
    expect(sameSolutionVideo('https://youtu.be/U1X9MmLh-ZQ', 'https://youtu.be/x2fO__sSSzU')).toBe(false);
  });

  it('treats blank and null as the same absence', () => {
    expect(sameSolutionVideo('', null)).toBe(true);
    expect(sameSolutionVideo(' ', undefined)).toBe(true);
  });
});

describe('storedSolutionVideo', () => {
  it('stores YouTube canonically', () => {
    expect(storedSolutionVideo(' https://youtu.be/U1X9MmLh-ZQ?si=x ')).toBe(CANONICAL);
  });

  it('stores blank as NULL, never an empty string the solutions count would read as solved', () => {
    expect(storedSolutionVideo('')).toBeNull();
    expect(storedSolutionVideo('  ')).toBeNull();
    expect(storedSolutionVideo(null)).toBeNull();
  });

  it('keeps a link it does not recognise as sent, so a legacy save never fails', () => {
    expect(storedSolutionVideo(' https://example.com/video.mp4 ')).toBe('https://example.com/video.mp4');
  });
});
