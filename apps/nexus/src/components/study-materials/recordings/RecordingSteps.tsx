'use client';

/**
 * The four steps beside a recording's video, each with one job.
 *
 *   Video        the file, which the card beside this shows in full
 *   Transcript   where it came from, or how to get one
 *   Checkpoints  how many, and the way into the editor
 *   Publish      what students get
 *
 * The dialog these replace called its second step "Transcript" and showed the
 * checkpoints in it, so "Edit" opened the checkpoints and "Replace" replaced the
 * transcript on the same line. Every button here does what its step is named for,
 * and the words on each button come from lib/recording-flow.ts, so the step, the
 * tab and the sticky bar on a phone always agree.
 */

import { useState } from 'react';
import { Box, Button, Collapse, LinearProgress, Paper, Typography, alpha } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import type {
  FlowAction,
  FlowActionKind,
  RecordingPlan,
  RecordingTrackView,
  StepState,
} from '@/lib/recording-flow';

export type RecordingBusy = 'preparing' | 'publishing' | 'saving' | null;

export interface RecordingStepsProps {
  label: string;
  track: RecordingTrackView;
  plan: RecordingPlan;
  busy: RecordingBusy;
  onAction: (kind: FlowActionKind) => void;
  /** Run the transcript search again, e.g. after putting a .vtt beside the video. */
  onLookAgain: () => void;
  onReplaceTranscript: () => void;
  onRedoCheckpoints: () => void;
  /**
   * The primary action is repeated in the sticky bar below 900px, so its button
   * here is hidden at those widths to avoid saying it twice on a phone.
   */
  primaryInStickyBar?: boolean;
}

const TRANSCRIPT_SOURCE: Record<string, string> = {
  upload: 'Uploaded by you',
  class: 'From the Teams class this recording came from',
  sharepoint: 'Found beside the video in SharePoint',
  stored: 'Stored with this recording',
};

function StepMarker({ index, state }: { index: number; state: StepState }) {
  if (state === 'done') {
    return <CheckCircleRoundedIcon aria-hidden sx={{ fontSize: 26, color: 'success.main', flexShrink: 0 }} />;
  }
  if (state === 'problem') {
    return <ReportProblemRoundedIcon aria-hidden sx={{ fontSize: 26, color: 'warning.main', flexShrink: 0 }} />;
  }
  return (
    <Box
      aria-hidden
      sx={{
        flexShrink: 0,
        width: 26,
        height: 26,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: '0.8125rem',
        fontWeight: 700,
        color: state === 'blocked' ? 'text.disabled' : 'primary.main',
        bgcolor: (theme) =>
          state === 'blocked'
            ? alpha(theme.palette.text.primary, 0.06)
            : alpha(theme.palette.primary.main, 0.12),
      }}
    >
      {index}
    </Box>
  );
}

const STATE_WORD: Record<StepState, string> = {
  done: 'done',
  current: 'to do now',
  blocked: 'not yet',
  problem: 'needs attention',
};

function Step({
  index,
  title,
  state,
  children,
}: {
  index: number;
  title: string;
  state: StepState;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        gap: 1.5,
        py: 1.75,
        listStyle: 'none',
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <StepMarker index={index} state={state} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="h3"
          sx={{
            fontWeight: 700,
            fontSize: '0.9375rem',
            lineHeight: '26px',
            color: state === 'blocked' ? 'text.disabled' : 'text.primary',
          }}
        >
          {title}
        </Typography>
        {/* The state in words for a screen reader, since the marker is only a picture. */}
        <Box component="span" sx={visuallyHidden}>
          {STATE_WORD[state]}
        </Box>
        {children}
      </Box>
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function Detail({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Typography variant="body2" sx={{ color: muted ? 'text.disabled' : 'text.secondary', mt: 0.25, lineHeight: 1.55 }}>
      {children}
    </Typography>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.25 }}>{children}</Box>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function RecordingSteps({
  label,
  track,
  plan,
  busy,
  onAction,
  onLookAgain,
  onReplaceTranscript,
  onRedoCheckpoints,
  primaryInStickyBar = false,
}: RecordingStepsProps) {
  const [showHelp, setShowHelp] = useState(false);
  const isBusy = busy !== null;
  const offered: FlowAction[] = [plan.primary, ...plan.secondary].filter((a): a is FlowAction => !!a);
  const offers = (kind: FlowActionKind) => offered.find((a) => a.kind === kind) ?? null;

  const actionButton = (
    kind: FlowActionKind,
    fallbackLabel: string,
    icon?: React.ReactNode,
    variantWhenSecondary: 'outlined' | 'text' = 'outlined',
  ) => {
    const primary = plan.primary?.kind === kind;
    return (
      <Button
        key={kind}
        variant={primary ? 'contained' : variantWhenSecondary}
        startIcon={icon}
        onClick={() => onAction(kind)}
        disabled={isBusy}
        sx={{
          minHeight: 44,
          textTransform: 'none',
          fontWeight: primary ? 700 : 600,
          ...(primary && primaryInStickyBar ? { display: { xs: 'none', md: 'inline-flex' } } : {}),
        }}
      >
        {offers(kind)?.label ?? fallbackLabel}
      </Button>
    );
  };

  const problem = plan.steps.video === 'problem';
  const hasTranscriptRow = track.transcript?.status === 'ok';
  const checkpoints = track.section_count || 0;
  const questions = track.question_count || 0;
  const preparingHere = busy === 'preparing';

  const progress = (
    <Box sx={{ mt: 1.25 }} role="status" aria-live="polite">
      <LinearProgress sx={{ borderRadius: 1, mb: 1 }} />
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
        Creating checkpoints. Nexus is finding the transcript and writing the questions, which can take a minute. You
        can leave this page; it carries on.
      </Typography>
    </Box>
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, px: { xs: 2, sm: 2.5 }, py: 1 }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1rem', pt: 1.25 }}>
        Get {label} ready
      </Typography>

      <Box component="ol" sx={{ m: 0, p: 0 }}>
        {/* 1. Video */}
        <Step index={1} title="Video" state={plan.steps.video}>
          {problem ? (
            <>
              <Detail>Replace this video before anything else. The reason is shown with the video.</Detail>
              {offers('replace_video') && (
                <Actions>{actionButton('replace_video', 'Replace video', <SwapHorizRoundedIcon />)}</Actions>
              )}
            </>
          ) : (
            <Detail>Attached from SharePoint. Play it to check it is the right class.</Detail>
          )}
        </Step>

        {/* 2. Transcript */}
        <Step index={2} title="Transcript" state={plan.steps.transcript}>
          {plan.steps.transcript === 'blocked' ? (
            <Detail muted>{problem ? 'Fix the video first.' : 'Add the video first.'}</Detail>
          ) : plan.steps.transcript === 'done' ? (
            <>
              <Detail>
                {hasTranscriptRow
                  ? `${TRANSCRIPT_SOURCE[track.transcript?.source || ''] ?? 'Stored with this recording'}${
                      track.transcript?.segments ? `, ${track.transcript.segments} lines` : ''
                    }.`
                  : 'Used to create the checkpoints.'}
              </Detail>
              <Actions>
                <Button
                  variant="text"
                  startIcon={<UploadFileRoundedIcon />}
                  onClick={onReplaceTranscript}
                  disabled={isBusy}
                  sx={{ minHeight: 44, textTransform: 'none' }}
                >
                  Replace transcript
                </Button>
              </Actions>
            </>
          ) : preparingHere ? (
            progress
          ) : (
            <>
              <Detail>
                Nexus looked in the Teams class this recording came from and beside the video in SharePoint, and found
                none. Upload the transcript to create checkpoints.
              </Detail>
              <Actions>
                {actionButton('upload_transcript', 'Upload transcript (.vtt)', <UploadFileRoundedIcon />)}
                <Button variant="text" onClick={onLookAgain} disabled={isBusy} sx={{ minHeight: 44, textTransform: 'none' }}>
                  Look again
                </Button>
                <Button
                  variant="text"
                  onClick={() => setShowHelp((v) => !v)}
                  disabled={isBusy}
                  aria-expanded={showHelp}
                  sx={{ minHeight: 44, textTransform: 'none', color: 'text.secondary' }}
                >
                  Where do I get one?
                </Button>
              </Actions>
              <Collapse in={showHelp}>
                <Box component="ol" sx={{ m: 0, mt: 1, pl: 2.5, color: 'text.secondary', typography: 'body2', lineHeight: 1.6 }}>
                  <li>Open the video in SharePoint (use the link beside the video).</li>
                  <li>Open the Transcript panel. If there is none, create one there and choose the language spoken.</li>
                  <li>Choose Download and pick the .vtt format.</li>
                  <li>Upload that file here. It stays with this recording only.</li>
                </Box>
              </Collapse>
            </>
          )}
        </Step>

        {/* 3. Checkpoints */}
        <Step index={3} title="Checkpoints" state={plan.steps.checkpoints}>
          {plan.steps.checkpoints === 'blocked' ? (
            <Detail muted>{problem ? 'Fix the video first.' : 'Needs the transcript first.'}</Detail>
          ) : plan.steps.checkpoints === 'done' ? (
            <>
              <Detail>
                {plural(checkpoints, 'checkpoint')} · {plural(questions, 'question')}. The video stops at each one
                until the student passes.
              </Detail>
              <Actions>
                {actionButton('review_checkpoints', 'Review checkpoints', <ChevronRightRoundedIcon />)}
                <Button variant="text" onClick={onRedoCheckpoints} disabled={isBusy} sx={{ minHeight: 44, textTransform: 'none', color: 'text.secondary' }}>
                  Redo from transcript
                </Button>
              </Actions>
            </>
          ) : preparingHere ? (
            progress
          ) : (
            <>
              <Detail>
                Nexus writes the questions from the transcript. You can read and change every one before publishing.
              </Detail>
              <Actions>{actionButton('create_checkpoints', 'Create checkpoints', <AutoAwesomeRoundedIcon />)}</Actions>
            </>
          )}
        </Step>

        {/* 4. Publish */}
        <Step index={4} title="Publish" state={plan.steps.publish}>
          {plan.steps.publish === 'done' ? (
            <>
              <Detail>
                {checkpoints > 0
                  ? 'Students can watch it, and finishing it unlocks the chapter test.'
                  : 'Students can watch it freely. It has no checkpoints, so it does not unlock the chapter test.'}
              </Detail>
              {offers('unpublish') && <Actions>{actionButton('unpublish', 'Unpublish', undefined, 'text')}</Actions>}
            </>
          ) : plan.steps.publish === 'problem' ? (
            <>
              <Detail>
                Published, but held back{track.hold_reason ? ` (${track.hold_reason})` : ''}, so students cannot see it
                yet.
              </Detail>
              {offers('unpublish') && <Actions>{actionButton('unpublish', 'Unpublish', undefined, 'text')}</Actions>}
            </>
          ) : plan.steps.publish === 'current' ? (
            <>
              <Detail>Students see nothing until you publish.</Detail>
              <Actions>{actionButton('publish', `Publish ${label}`, <PublishRoundedIcon />)}</Actions>
            </>
          ) : offers('publish_open') ? (
            <>
              <Detail>
                You can publish now without checkpoints. Students can watch freely, and it will not unlock the chapter
                test.
              </Detail>
              <Actions>{actionButton('publish_open', 'Publish without checkpoints', <VisibilityOutlinedIcon />)}</Actions>
            </>
          ) : (
            <Detail muted>{problem ? 'Available once the video is fixed.' : 'Available once there are checkpoints.'}</Detail>
          )}
        </Step>
      </Box>
    </Paper>
  );
}
