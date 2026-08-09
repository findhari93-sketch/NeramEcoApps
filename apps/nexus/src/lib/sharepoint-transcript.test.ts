import { describe, it, expect } from 'vitest';
import { pickSiblingVtt, normalizeRecordingUrl, encodeSharingUrl } from './sharepoint-transcript';

/**
 * The bug these pin: a folder holding a chapter's English and Tamil recordings
 * used to hand whichever ".vtt" Graph listed first to both of them, so one track
 * got checkpoints cut from the other language's audio and nothing reported a
 * failure, because a transcript WAS found.
 */

const file = (name: string) => ({ id: name, name });

describe('pickSiblingVtt', () => {
  it('matches the transcript to the video by base name', () => {
    const children = [
      file('ch01-history-en.mp4'),
      file('ch01-history-en.vtt'),
      file('ch01-history-ta.mp4'),
      file('ch01-history-ta.vtt'),
    ];
    expect(pickSiblingVtt(children, 'ch01-history-ta.mp4')?.name).toBe('ch01-history-ta.vtt');
    expect(pickSiblingVtt(children, 'ch01-history-en.mp4')?.name).toBe('ch01-history-en.vtt');
  });

  it('ignores case and the extension when matching', () => {
    const children = [file('Ch01 History EN.VTT')];
    expect(pickSiblingVtt(children, 'ch01 history en.mp4')?.name).toBe('Ch01 History EN.VTT');
  });

  it('takes the only transcript when nothing matches by name', () => {
    const children = [file('recording.mp4'), file('transcript.vtt')];
    expect(pickSiblingVtt(children, 'recording.mp4')?.name).toBe('transcript.vtt');
  });

  /**
   * The point of the whole change. Guessing here is what produced the wrong
   * checkpoints, and the teacher uploading by hand is the primary path anyway.
   */
  it('refuses to guess between several unmatched transcripts', () => {
    const children = [file('recording.mp4'), file('one.vtt'), file('two.vtt')];
    expect(pickSiblingVtt(children, 'recording.mp4')).toBeNull();
  });

  it('answers null when the folder holds no transcript', () => {
    expect(pickSiblingVtt([file('a.mp4'), file('notes.pdf')], 'a.mp4')).toBeNull();
  });

  it('survives a folder listing that is not an array', () => {
    expect(pickSiblingVtt(undefined, 'a.mp4')).toBeNull();
    expect(pickSiblingVtt(null, 'a.mp4')).toBeNull();
    expect(pickSiblingVtt([{ id: 'x' }], 'a.mp4')).toBeNull();
  });

  it('still finds the single transcript when the video name is unknown', () => {
    expect(pickSiblingVtt([file('only.vtt')], undefined)?.name).toBe('only.vtt');
  });
});

describe('normalizeRecordingUrl', () => {
  it('pulls the real file URL out of a Teams recap link', () => {
    const real = 'https://neram.sharepoint.com/sites/X/Recordings/Ch1.mp4?web=1';
    const recap = `https://teams.microsoft.com/l/meetingrecap?fileUrl=${encodeURIComponent(real)}&driveId=abc`;
    expect(normalizeRecordingUrl(recap)).toBe(real);
  });

  it('hands back a plain SharePoint link unchanged', () => {
    const url = 'https://neram.sharepoint.com/sites/X/Recordings/Ch1.mp4';
    expect(normalizeRecordingUrl(url)).toBe(url);
  });

  it('hands back something that is not a URL unchanged', () => {
    expect(normalizeRecordingUrl('  not a url  ')).toBe('not a url');
    expect(normalizeRecordingUrl('')).toBe('');
  });
});

describe('encodeSharingUrl', () => {
  it('produces the u! base64url form Graph /shares expects', () => {
    const encoded = encodeSharingUrl('https://example.com/a?b=c');
    expect(encoded.startsWith('u!')).toBe(true);
    expect(encoded).not.toMatch(/[+/=]/);
  });
});
