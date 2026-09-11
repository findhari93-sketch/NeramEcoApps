/**
 * One language's recording, reduced to where it stands and the one thing to do next.
 *
 * The recordings page shows four steps down the page (Video, Transcript,
 * Checkpoints, Publish) and a single primary button. Which button, and what each
 * step says, is decided here and nowhere else, so the tab label, the steps and
 * the sticky action bar on a phone can never disagree.
 *
 * The old dialog showed every control at once, Change, Move, Edit, Replace,
 * Publish and Remove, with nothing to say which mattered now. A teacher looking
 * at a draft with checkpoints could not tell that Publish was the next step.
 *
 * Pure TypeScript, no JSX and no next/* imports.
 */

import type { RecordingTrack } from './chapter-recordings';

/**
 * Why a video cannot be used, as the tracks API reports it.
 *
 * UNRESOLVED means Nexus could not check the file just now (Graph slow or
 * throttled). It is never treated as broken: a teacher must not be told to
 * replace a video because Microsoft was busy.
 */
export type RecordingProblem =
  | 'RECORDING_IN_ONEDRIVE'
  | 'NOT_FOUND'
  | 'NO_ACCESS'
  | 'NOT_A_VIDEO'
  | 'UNRESOLVED';

/** What Nexus found when it looked the video up in SharePoint. */
export interface ResolvedRecording {
  name: string | null;
  web_url: string | null;
  /** The folder inside its library, e.g. "nexus/class-videos". */
  folder_path: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  drive_type: string | null;
  problem: RecordingProblem | null;
}

/** The stored transcript row, if one exists. Only status 'ok' holds usable text. */
export interface StoredTranscriptInfo {
  source: string | null;
  status: string | null;
  segments: number | null;
}

export interface RecordingTrackView extends RecordingTrack {
  recording?: ResolvedRecording | null;
  transcript?: StoredTranscriptInfo | null;
  question_count?: number;
}

export type FlowStage =
  | 'no_video'
  | 'video_problem'
  | 'needs_transcript'
  | 'needs_checkpoints'
  | 'ready_to_publish'
  | 'live'
  | 'live_open'
  | 'on_hold';

export type FlowActionKind =
  | 'find_video'
  | 'paste_link'
  | 'replace_video'
  | 'upload_transcript'
  | 'create_checkpoints'
  | 'publish'
  | 'publish_open'
  | 'review_checkpoints'
  | 'unpublish';

export interface FlowAction {
  kind: FlowActionKind;
  label: string;
}

export type StepState = 'done' | 'current' | 'blocked' | 'problem';
export type StepKey = 'video' | 'transcript' | 'checkpoints' | 'publish';

export interface RecordingPlan {
  stage: FlowStage;
  /** The word under the language on its tab. */
  tabStatus: string;
  primary: FlowAction | null;
  secondary: FlowAction[];
  steps: Record<StepKey, StepState>;
}

const BLOCKING_PROBLEMS: ReadonlySet<RecordingProblem> = new Set([
  'RECORDING_IN_ONEDRIVE',
  'NOT_FOUND',
  'NO_ACCESS',
  'NOT_A_VIDEO',
]);

/** A problem worth stopping for, or null. */
export function videoProblem(track: RecordingTrackView | null): RecordingProblem | null {
  const problem = track?.recording?.problem ?? null;
  return problem && BLOCKING_PROBLEMS.has(problem) ? problem : null;
}

export function hasStoredTranscript(track: RecordingTrackView | null): boolean {
  return track?.transcript?.status === 'ok';
}

const action = (kind: FlowActionKind, label: string): FlowAction => ({ kind, label });

const FIND_VIDEO = action('find_video', 'Find video in SharePoint');
const PASTE_LINK = action('paste_link', 'Paste a SharePoint link');
const REPLACE_VIDEO = action('replace_video', 'Replace video');
const UPLOAD_TRANSCRIPT = action('upload_transcript', 'Upload transcript (.vtt)');
const CREATE_CHECKPOINTS = action('create_checkpoints', 'Create checkpoints');
const PUBLISH_OPEN = action('publish_open', 'Publish without checkpoints');
const REVIEW_CHECKPOINTS = action('review_checkpoints', 'Review checkpoints');
const UNPUBLISH = action('unpublish', 'Unpublish');

export function planRecording(track: RecordingTrackView | null, label: string): RecordingPlan {
  if (!track) {
    return {
      stage: 'no_video',
      tabStatus: 'Not added',
      primary: FIND_VIDEO,
      secondary: [PASTE_LINK],
      steps: { video: 'current', transcript: 'blocked', checkpoints: 'blocked', publish: 'blocked' },
    };
  }

  const hasCheckpoints = track.section_count > 0;
  // A track made before transcripts were stored can have checkpoints and no
  // transcript row. Its transcript step is done: it was used, just not kept.
  const hasTranscript = hasCheckpoints || hasStoredTranscript(track);
  const published = track.status === 'published';
  // A NULL readiness is ready: the column arrived after the first tracks did.
  const ready = (track.readiness ?? 'ready') === 'ready';
  const problem = videoProblem(track);

  const steps: Record<StepKey, StepState> = {
    video: problem ? 'problem' : 'done',
    transcript: problem ? 'blocked' : hasTranscript ? 'done' : 'current',
    checkpoints: problem || !hasTranscript ? 'blocked' : hasCheckpoints ? 'done' : 'current',
    publish: problem
      ? 'blocked'
      : published
        ? ready
          ? 'done'
          : 'problem'
        : hasCheckpoints
          ? 'current'
          : 'blocked',
  };

  // The video comes first even on a live recording: nothing else on the page
  // matters while the file itself is the problem.
  if (problem) {
    return {
      stage: 'video_problem',
      tabStatus: 'Needs a fix',
      primary: REPLACE_VIDEO,
      secondary: published ? [UNPUBLISH] : [],
      steps,
    };
  }

  const addCheckpoints = hasTranscript ? CREATE_CHECKPOINTS : UPLOAD_TRANSCRIPT;

  if (published && !ready) {
    return {
      stage: 'on_hold',
      tabStatus: 'On hold',
      primary: hasCheckpoints ? REVIEW_CHECKPOINTS : addCheckpoints,
      secondary: [UNPUBLISH],
      steps,
    };
  }

  if (published && hasCheckpoints) {
    return { stage: 'live', tabStatus: 'Live', primary: REVIEW_CHECKPOINTS, secondary: [UNPUBLISH], steps };
  }

  if (published) {
    return { stage: 'live_open', tabStatus: 'Live, open', primary: addCheckpoints, secondary: [UNPUBLISH], steps };
  }

  if (hasCheckpoints) {
    return {
      stage: 'ready_to_publish',
      tabStatus: 'Draft',
      primary: action('publish', `Publish ${label}`),
      secondary: [REVIEW_CHECKPOINTS],
      steps,
    };
  }

  if (hasTranscript) {
    return {
      stage: 'needs_checkpoints',
      tabStatus: 'Draft',
      primary: CREATE_CHECKPOINTS,
      secondary: [PUBLISH_OPEN],
      steps,
    };
  }

  return {
    stage: 'needs_transcript',
    tabStatus: 'Draft',
    primary: UPLOAD_TRANSCRIPT,
    secondary: [PUBLISH_OPEN],
    steps,
  };
}
