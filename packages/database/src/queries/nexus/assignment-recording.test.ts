/**
 * Which recording a student is shown against an assignment.
 *
 * This is here because the preference order was fine and the lookup was not.
 * `resolveAssignmentRecording` searched for the class by `plan_entry_id`, a
 * column `createAssignment` has never written, so in production every
 * assignment had NULL there while the class it was set in sat on a perfectly
 * good recording. The fallback had never fired once. Pulling the ordering out
 * into a pure function is what lets that ordering be checked without a
 * database, and lets the lookup be fixed without touching it.
 */
import { describe, it, expect } from 'vitest';
import { pickAssignmentRecording } from './assignments';

const NONE = { recording_url: null, recording_source: null } as any;

describe('pickAssignmentRecording', () => {
  it('prefers the assignment\'s own link over anything on the class', () => {
    const picked = pickAssignmentRecording(
      { recording_url: 'https://own.example/rec', recording_source: 'sharepoint' } as any,
      { youtube_url: 'https://youtu.be/abc', recording_url: 'https://sp.example/rec' },
    );
    expect(picked).toEqual({ url: 'https://own.example/rec', source: 'sharepoint' });
  });

  it('assumes SharePoint when an own link carries no source', () => {
    // recording_source is nullable and older rows leave it unset. Guessing
    // YouTube would try to embed a SharePoint page in an iframe.
    const picked = pickAssignmentRecording(
      { recording_url: 'https://own.example/rec', recording_source: null } as any,
      null,
    );
    expect(picked.source).toBe('sharepoint');
  });

  it('falls back to the class YouTube backup before the SharePoint copy', () => {
    // YouTube embeds and plays in place; the SharePoint copy has to open in
    // another tab, which loses the student's place in the assignment.
    const picked = pickAssignmentRecording(NONE, {
      youtube_url: 'https://youtu.be/abc',
      recording_url: 'https://sp.example/rec',
    });
    expect(picked).toEqual({ url: 'https://youtu.be/abc', source: 'youtube' });
  });

  it('uses the class SharePoint copy when there is no YouTube backup', () => {
    // This is the real shape of the data today: 3 of 4 linked classes have a
    // SharePoint recording and none has a YouTube one.
    const picked = pickAssignmentRecording(NONE, {
      youtube_url: null,
      recording_url: 'https://sp.example/rec',
    });
    expect(picked).toEqual({ url: 'https://sp.example/rec', source: 'sharepoint' });
  });

  it('reports nothing when the class has no recording yet', () => {
    expect(pickAssignmentRecording(NONE, { youtube_url: null, recording_url: null })).toEqual({
      url: null,
      source: null,
    });
  });

  it('reports nothing when there is no class at all', () => {
    expect(pickAssignmentRecording(NONE, null)).toEqual({ url: null, source: null });
    expect(pickAssignmentRecording(NONE, undefined)).toEqual({ url: null, source: null });
  });

  it('never returns a source without a url', () => {
    // The UI keys "show the recording block" off the url, so a source with no
    // url would render an empty player.
    for (const cls of [null, { youtube_url: null, recording_url: null }]) {
      const picked = pickAssignmentRecording(NONE, cls);
      if (!picked.url) expect(picked.source).toBeNull();
    }
  });
});
