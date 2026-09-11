import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RecordingSteps, { type RecordingStepsProps } from './RecordingSteps';
import { planRecording, type RecordingTrackView } from '@/lib/recording-flow';

/**
 * The four steps beside a recording's video: Video, Transcript, Checkpoints,
 * Publish.
 *
 * The dialog these replace called its second step "Transcript" and showed the
 * checkpoints in it, so "Edit" and "Replace" on that line did two different
 * things to two different objects. These tests pin one job per step, named,
 * and one next action a teacher can find.
 */

const resolved = {
  name: 'Ch1 History Tamil.mp4',
  web_url: 'https://neram.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/Ch1%20History%20Tamil.mp4',
  folder_path: 'nexus',
  size_bytes: 877174153,
  duration_seconds: 3758,
  drive_type: 'documentLibrary',
  problem: null,
};

const track = (over: Partial<RecordingTrackView> = {}): RecordingTrackView => ({
  id: 't1',
  language: 'ta',
  language_label: 'தமிழ்',
  title: 'Ch:1 History Of Architecture (தமிழ்)',
  status: 'draft',
  readiness: 'pending',
  hold_reason: null,
  section_count: 0,
  video_duration_seconds: 3758,
  video_source: 'sharepoint',
  recording_url: resolved.web_url,
  recording_file_name: resolved.name,
  recording: resolved,
  transcript: null,
  question_count: 0,
  ...over,
});

function renderSteps(t: RecordingTrackView, over: Partial<RecordingStepsProps> = {}) {
  const props: RecordingStepsProps = {
    label: 'தமிழ்',
    track: t,
    plan: planRecording(t, 'தமிழ்'),
    busy: null,
    onAction: vi.fn(),
    onLookAgain: vi.fn(),
    onReplaceTranscript: vi.fn(),
    onRedoCheckpoints: vi.fn(),
    ...over,
  };
  render(<RecordingSteps {...props} />);
  return props;
}

describe('RecordingSteps', () => {
  it('reads as four named steps, in the order they happen', () => {
    renderSteps(track());
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Video',
      'Transcript',
      'Checkpoints',
      'Publish',
    ]);
  });

  it('asks for the transcript, says where Nexus already looked, and offers publishing without checkpoints', () => {
    const props = renderSteps(track());
    expect(document.body.textContent).toContain('Teams class');
    fireEvent.click(screen.getByRole('button', { name: 'Upload transcript (.vtt)' }));
    expect(props.onAction).toHaveBeenCalledWith('upload_transcript');
    fireEvent.click(screen.getByRole('button', { name: 'Publish without checkpoints' }));
    expect(props.onAction).toHaveBeenCalledWith('publish_open');
  });

  it('can look for the transcript again', () => {
    const props = renderSteps(track());
    fireEvent.click(screen.getByRole('button', { name: 'Look again' }));
    expect(props.onLookAgain).toHaveBeenCalled();
  });

  it('says where the transcript came from', () => {
    renderSteps(
      track({ section_count: 4, question_count: 40, transcript: { source: 'class', status: 'ok', segments: 380 } }),
    );
    expect(document.body.textContent).toContain('From the Teams class');
  });

  it('offers to create checkpoints once a transcript is stored', () => {
    const props = renderSteps(track({ transcript: { source: 'upload', status: 'ok', segments: 20 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Create checkpoints' }));
    expect(props.onAction).toHaveBeenCalledWith('create_checkpoints');
  });

  it('counts checkpoints and questions, and leads to the editor', () => {
    const props = renderSteps(track({ section_count: 4, question_count: 40 }));
    expect(document.body.textContent).toContain('4 checkpoints');
    expect(document.body.textContent).toContain('40 questions');
    fireEvent.click(screen.getByRole('button', { name: 'Review checkpoints' }));
    expect(props.onAction).toHaveBeenCalledWith('review_checkpoints');
  });

  it('puts Publish, with the language on it, on the step that is ready for it', () => {
    const props = renderSteps(track({ section_count: 4, question_count: 40 }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish தமிழ்' }));
    expect(props.onAction).toHaveBeenCalledWith('publish');
  });

  it('keeps Unpublish to hand on a live recording', () => {
    const props = renderSteps(
      track({ status: 'published', readiness: 'ready', section_count: 4, question_count: 40 }),
    );
    expect(document.body.textContent).toContain('Students can watch it');
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(props.onAction).toHaveBeenCalledWith('unpublish');
  });

  it('says what is happening and blocks every action while checkpoints are being created', () => {
    renderSteps(track(), { busy: 'preparing' });
    expect(document.body.textContent).toContain('Creating checkpoints');
    const buttons = screen.queryAllByRole('button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('offers nothing to publish while the video needs a fix', () => {
    renderSteps(track({ section_count: 4, recording: { ...resolved, problem: 'RECORDING_IN_ONEDRIVE' } }));
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
  });
});
