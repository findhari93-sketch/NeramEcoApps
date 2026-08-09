import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LanguageTrackRow, { type LanguageTrackRowProps } from './LanguageTrackRow';
import { describeTrackState, type RecordingTrack, type TrackRow } from '@/lib/chapter-recordings';

/**
 * The row exists to answer one question the old layout could not: where does the
 * video go.
 *
 * The five buttons it replaces were Upload transcript, Edit checkpoints, Publish
 * as open, Try fetching it and Remove, laid in a line with nothing to say they
 * were a sequence and nothing at all about the recording itself. A teacher
 * reading the English row saw transcript-and-publish controls and reasonably
 * concluded there was nowhere to attach a video, because there was not.
 *
 * These tests pin the three things that fix that: the video is step one, it is
 * NAMED once attached, and the later steps stay visible while they wait.
 */

const track = (over: Partial<RecordingTrack> = {}): RecordingTrack => ({
  id: 'track-en',
  language: 'en',
  language_label: 'English',
  title: 'English recording',
  status: 'draft',
  readiness: 'pending',
  hold_reason: null,
  section_count: 0,
  video_duration_seconds: 3600,
  video_source: 'sharepoint',
  recording_url: 'https://neramclasses.sharepoint.com/sites/Neram/Recordings/Ch3%20English.mp4',
  ...over,
});

function rowFor(t: RecordingTrack | null): TrackRow {
  return { code: 'en', label: 'English', track: t, state: describeTrackState(t) };
}

function renderRow(t: RecordingTrack | null, over: Partial<LanguageTrackRowProps> = {}) {
  const props: LanguageTrackRowProps = {
    row: rowFor(t),
    busy: false,
    isPasting: false,
    recordingUrl: '',
    onRecordingUrlChange: vi.fn(),
    unreachable: false,
    onSearchVideo: vi.fn(),
    onOpenPaste: vi.fn(),
    onCancelPaste: vi.fn(),
    onSubmitVideo: vi.fn(),
    moveTargets: [{ code: 'ta', label: 'தமிழ்', taken: false }],
    onChangeLanguage: vi.fn(),
    onUploadVtt: vi.fn(),
    onFetchTranscript: vi.fn(),
    onEditCheckpoints: vi.fn(),
    onPublish: vi.fn(),
    onPublishOpen: vi.fn(),
    onUnpublish: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  render(<LanguageTrackRow {...props} />);
  return props;
}

describe('LanguageTrackRow', () => {
  it('leads with searching for the video when there is none, which is the whole point', () => {
    renderRow(null);

    // The button whose absence caused the question this row was rebuilt to answer.
    expect(
      screen.getByRole('button', { name: /search sharepoint or onedrive/i }),
    ).toBeTruthy();
    // Pasting survives, demoted to the fallback it always should have been.
    expect(screen.getByRole('button', { name: /paste a link/i })).toBeTruthy();
  });

  it('keeps steps 2 and 3 on screen while they wait, rather than hiding them', () => {
    // Hiding a step a teacher cannot start yet is how they end up unable to tell
    // whether it exists. Both say what they are waiting for.
    renderRow(null);

    expect(screen.getByText('Transcript')).toBeTruthy();
    expect(screen.getByText('Publish')).toBeTruthy();
    expect(screen.getAllByText(/add the video first/i)).toHaveLength(2);

    // And nothing in those steps is actionable yet.
    expect(screen.queryByRole('button', { name: /upload transcript/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
  });

  it('names the attached video, which the old row never did', () => {
    renderRow(track());

    expect(screen.getByText('Ch3 English.mp4')).toBeTruthy();
    expect(screen.getByRole('button', { name: /change the english video/i })).toBeTruthy();
  });

  it('offers the transcript and the open publish once a video exists', () => {
    renderRow(track());

    expect(screen.getByRole('button', { name: /upload transcript/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /try fetching it/i })).toBeTruthy();
    // No checkpoints, so the only honest publish is the open one, and it says
    // what that costs.
    expect(screen.getByRole('button', { name: /publish as open/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^publish$/i })).toBeNull();
  });

  it('collapses the transcript step to its count once checkpoints exist', () => {
    renderRow(track({ section_count: 8 }));

    expect(screen.getByText('8 checkpoints')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeTruthy();
    // With checkpoints the recording can be a real gate, so the plain publish
    // replaces the open one.
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /publish as open/i })).toBeNull();
  });

  /**
   * Re-filing, which exists because a Tamil recording was attached to the
   * English row and every exit from that cost work that was already correct:
   * Remove archives the transcript and the checkpoints, Change clears them on
   * purpose. Move sits with Change because that is where a teacher looks when
   * the video is wrong, and the two are one press apart precisely so the cheaper
   * one is not missed.
   */
  it('offers Move beside Change once a video is attached', () => {
    renderRow(track());

    expect(
      screen.getByRole('button', { name: /move the english recording to another language/i }),
    ).toBeTruthy();
  });

  it('does not offer Move before there is anything to move', () => {
    renderRow(null);

    expect(// Anchored: "Remove the English recording" contains this phrase too.
      screen.queryByRole('button', { name: /^move the english recording/i })).toBeNull();
  });

  it('hides Move when this is the only language on offer', () => {
    renderRow(track(), { moveTargets: [] });

    expect(// Anchored: "Remove the English recording" contains this phrase too.
      screen.queryByRole('button', { name: /^move the english recording/i })).toBeNull();
  });

  it('hands back the language picked from the menu', () => {
    const props = renderRow(track());

    fireEvent.click(
      screen.getByRole('button', { name: /move the english recording to another language/i }),
    );
    fireEvent.click(screen.getByText('தமிழ்'));

    expect(props.onChangeLanguage).toHaveBeenCalledWith('ta');
  });

  /**
   * A greyed row with no explanation reads as broken. The reason sits on the
   * item itself, because that is where the teacher is looking when they cannot
   * press it.
   */
  it('greys an occupied language and says why', () => {
    const props = renderRow(track(), {
      moveTargets: [{ code: 'ta', label: 'தமிழ்', taken: true }],
    });

    fireEvent.click(
      screen.getByRole('button', { name: /move the english recording to another language/i }),
    );
    expect(screen.getByText(/already has a recording/i)).toBeTruthy();

    fireEvent.click(screen.getByText('தமிழ்'));
    expect(props.onChangeLanguage).not.toHaveBeenCalled();
  });

  it('collapses every step once the recording is live', () => {
    renderRow(track({ status: 'published', readiness: 'ready', section_count: 8 }));

    expect(screen.getByText('Ch3 English.mp4')).toBeTruthy();
    expect(screen.getByText('8 checkpoints')).toBeTruthy();
    expect(screen.getByText(/students can watch it/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /unpublish/i })).toBeTruthy();
  });

  it('hides "Try fetching it" for a YouTube track, which has no folder to search', () => {
    renderRow(track({ video_source: 'youtube', recording_url: 'https://youtu.be/dQw4w9WgXcQ' }));

    expect(screen.getByText('YouTube video dQw4w9WgXcQ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try fetching it/i })).toBeNull();
    // Uploading is still the way in, because it is the only way in.
    expect(screen.getByRole('button', { name: /upload transcript/i })).toBeTruthy();
  });

  it('does not offer "Attach it anyway" before the server has refused the link', () => {
    // The override must not be reachable before a refusal, or it stops being an
    // override and becomes one more button to click past a check that protects
    // students from a player that will not load.
    renderRow(null, { isPasting: true, recordingUrl: 'https://example.com/a.mp4' });

    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy(); // field is open
    expect(screen.queryByRole('button', { name: /attach it anyway/i })).toBeNull();
  });

  it('shows the override once a link has been refused, keeping what was typed', () => {
    renderRow(null, {
      isPasting: true,
      recordingUrl: 'https://example.com/a.mp4',
      unreachable: true,
    });

    expect(screen.getByRole('button', { name: /attach it anyway/i })).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/a.mp4')).toBeTruthy();
  });

  it('does not offer Remove on a language that has nothing to remove', () => {
    renderRow(null);
    expect(screen.queryByRole('button', { name: /remove the english recording/i })).toBeNull();
  });

  it('offers Remove once there is a recording, kept away from the step actions', () => {
    renderRow(track());
    expect(screen.getByRole('button', { name: /remove the english recording/i })).toBeTruthy();
  });

  it('sends the search request for this language when the primary button is pressed', () => {
    const props = renderRow(null);

    fireEvent.click(screen.getByRole('button', { name: /search sharepoint or onedrive/i }));
    expect(props.onSearchVideo).toHaveBeenCalledOnce();
  });
});
