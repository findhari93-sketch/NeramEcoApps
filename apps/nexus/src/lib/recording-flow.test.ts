import { describe, it, expect } from 'vitest';
import { planRecording, type RecordingTrackView } from './recording-flow';

/**
 * One language's recording, reduced to the one thing to do next.
 *
 * The screen this replaces showed every control at once: Change, Move, Edit,
 * Replace, Publish and Remove, with nothing to say which mattered now. These
 * tests pin a single primary action per state, named in words, and the four
 * steps a teacher can read down the page.
 */

const resolved = {
  name: 'Ch1 History Tamil.mp4',
  web_url: 'https://neram.sharepoint.com/sites/Neram/Shared%20Documents/nexus/class-videos/Ch1%20History%20Tamil.mp4',
  folder_path: 'nexus/class-videos',
  size_bytes: 412_000_000,
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
  ...over,
});

describe('planRecording', () => {
  it('asks for the video first when there is none', () => {
    const plan = planRecording(null, 'English');
    expect(plan.stage).toBe('no_video');
    expect(plan.tabStatus).toBe('Not added');
    expect(plan.primary).toMatchObject({ kind: 'find_video', label: 'Find video in SharePoint' });
    expect(plan.secondary.map((a) => a.kind)).toEqual(['paste_link']);
    expect(plan.steps).toEqual({
      video: 'current',
      transcript: 'blocked',
      checkpoints: 'blocked',
      publish: 'blocked',
    });
  });

  it('sends a OneDrive video back to be replaced before anything else, checkpoints or not', () => {
    const plan = planRecording(
      track({ section_count: 4, recording: { ...resolved, problem: 'RECORDING_IN_ONEDRIVE' } }),
      'தமிழ்',
    );
    expect(plan.stage).toBe('video_problem');
    expect(plan.tabStatus).toBe('Needs a fix');
    expect(plan.primary?.kind).toBe('replace_video');
    expect(plan.steps.video).toBe('problem');
    expect(plan.steps.publish).toBe('blocked');
  });

  it('flags a live recording whose video students cannot play', () => {
    const plan = planRecording(
      track({
        status: 'published',
        readiness: 'ready',
        section_count: 4,
        recording: { ...resolved, problem: 'NOT_FOUND' },
      }),
      'தமிழ்',
    );
    expect(plan.stage).toBe('video_problem');
    expect(plan.primary?.kind).toBe('replace_video');
  });

  it('does not call a video broken just because Nexus could not check it this time', () => {
    const plan = planRecording(track({ recording: { ...resolved, problem: 'UNRESOLVED' } }), 'தமிழ்');
    expect(plan.stage).not.toBe('video_problem');
    expect(plan.steps.video).toBe('done');
  });

  it('asks for a transcript when there is none, and offers publishing without checkpoints', () => {
    const plan = planRecording(track(), 'தமிழ்');
    expect(plan.stage).toBe('needs_transcript');
    expect(plan.tabStatus).toBe('Draft');
    expect(plan.primary).toMatchObject({ kind: 'upload_transcript', label: 'Upload transcript (.vtt)' });
    expect(plan.secondary.map((a) => a.kind)).toContain('publish_open');
    expect(plan.steps).toEqual({
      video: 'done',
      transcript: 'current',
      checkpoints: 'blocked',
      publish: 'blocked',
    });
  });

  it('offers to create checkpoints once a transcript is stored', () => {
    const plan = planRecording(
      track({ transcript: { source: 'upload', status: 'ok', segments: 380 } }),
      'தமிழ்',
    );
    expect(plan.stage).toBe('needs_checkpoints');
    expect(plan.primary?.kind).toBe('create_checkpoints');
    expect(plan.steps.transcript).toBe('done');
    expect(plan.steps.checkpoints).toBe('current');
  });

  it('ignores a transcript row that recorded a failure', () => {
    const plan = planRecording(
      track({ transcript: { source: null, status: 'missing', segments: null } }),
      'தமிழ்',
    );
    expect(plan.stage).toBe('needs_transcript');
  });

  it('puts Publish first once checkpoints exist, and names the language on the button', () => {
    const plan = planRecording(track({ section_count: 4 }), 'தமிழ்');
    expect(plan.stage).toBe('ready_to_publish');
    expect(plan.primary).toMatchObject({ kind: 'publish', label: 'Publish தமிழ்' });
    expect(plan.secondary.map((a) => a.kind)).toContain('review_checkpoints');
    // A track made before transcripts were stored still has its checkpoints,
    // so the transcript step reads as done rather than asking for one again.
    expect(plan.steps).toEqual({
      video: 'done',
      transcript: 'done',
      checkpoints: 'done',
      publish: 'current',
    });
  });

  it('leads a live recording with reviewing its checkpoints, and keeps Unpublish to hand', () => {
    const plan = planRecording(
      track({ status: 'published', readiness: 'ready', section_count: 4 }),
      'தமிழ்',
    );
    expect(plan.stage).toBe('live');
    expect(plan.tabStatus).toBe('Live');
    expect(plan.primary?.kind).toBe('review_checkpoints');
    expect(plan.secondary.map((a) => a.kind)).toContain('unpublish');
    expect(plan.steps.publish).toBe('done');
  });

  it('calls a live recording without checkpoints open, and offers to add them', () => {
    const plan = planRecording(track({ status: 'published', readiness: 'ready' }), 'தமிழ்');
    expect(plan.stage).toBe('live_open');
    expect(plan.tabStatus).toBe('Live, open');
    expect(plan.primary?.kind).toBe('upload_transcript');
    expect(plan.secondary.map((a) => a.kind)).toContain('unpublish');
  });

  it('flags a published recording that is held back, which students cannot see', () => {
    const plan = planRecording(
      track({ status: 'published', readiness: 'held', hold_reason: 'thin_questions', section_count: 4 }),
      'தமிழ்',
    );
    expect(plan.stage).toBe('on_hold');
    expect(plan.tabStatus).toBe('On hold');
    expect(plan.steps.publish).toBe('problem');
  });

  it('always offers exactly one primary action', () => {
    const states: (RecordingTrackView | null)[] = [
      null,
      track(),
      track({ transcript: { source: 'upload', status: 'ok', segments: 10 } }),
      track({ section_count: 3 }),
      track({ status: 'published', readiness: 'ready', section_count: 3 }),
      track({ status: 'published', readiness: 'ready' }),
      track({ status: 'published', readiness: 'held', section_count: 3 }),
      track({ recording: { ...resolved, problem: 'NO_ACCESS' } }),
    ];
    for (const state of states) expect(planRecording(state, 'English').primary).not.toBeNull();
  });
});
