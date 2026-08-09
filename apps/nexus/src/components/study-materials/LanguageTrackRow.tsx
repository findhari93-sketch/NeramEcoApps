'use client';

/**
 * One language's recording, as three steps in the order they have to happen.
 *
 * The row this replaces laid five buttons in a line, with nothing to say they
 * were a sequence: Upload transcript, Edit checkpoints, Publish as open, Try
 * fetching it, Remove. A teacher opening it on the English row read "upload
 * transcript or publish as open" and reasonably asked where the video goes.
 *
 * Nowhere, was the answer. THE VIDEO WAS THE MISSING STEP. It could only be
 * attached through a paste box hidden behind an Add button, and once attached it
 * vanished: no file name, no link, no way to change it. So the one row that
 * should have led with "here is the recording" was the only thing on screen that
 * never mentioned it.
 *
 * Three steps, always all three, in order:
 *   1  Video       search SharePoint and OneDrive, or paste a link
 *   2  Transcript  upload the .vtt, or try fetching it, which makes checkpoints
 *   3  Publish     gated when it has checkpoints, open when it does not
 *
 * A finished step collapses to a tick line that still names what it holds, so a
 * complete row is compact without becoming silent. A step that cannot start yet
 * stays visible and greyed with the reason, rather than being hidden: a teacher
 * who cannot see step 3 cannot tell whether it exists.
 */

import { useState } from 'react';
import {
  Box, Typography, Button, Chip, TextField, Collapse, CircularProgress, Menu, MenuItem,
  alpha, useTheme,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { describeRecordingUrl, type TrackRow } from '@/lib/chapter-recordings';

/** Every control on this row, so touch targets never fall below the guideline. */
const actionSx = { textTransform: 'none' as const, minHeight: 48 };

/** One language this recording could be moved to. */
export interface MoveTarget {
  code: string;
  label: string;
  /** Already holds a recording, so the move would collide. Shown, not hidden. */
  taken: boolean;
}

export interface LanguageTrackRowProps {
  row: TrackRow;
  /**
   * A request for THIS language is in flight. One flag rather than a separate
   * "submitting": a row can only be doing one thing at a time, and two flags
   * meant the search and paste buttons of a language with no track yet stayed
   * pressable while its own save was still running.
   */
  busy: boolean;
  /** The paste field is open for this language. */
  isPasting: boolean;
  recordingUrl: string;
  onRecordingUrlChange: (value: string) => void;
  /** Set when this language's last save was refused as unplayable. */
  unreachable: boolean;

  onSearchVideo: () => void;
  onOpenPaste: () => void;
  onCancelPaste: () => void;
  onSubmitVideo: (opts?: { force?: boolean }) => void;

  /** The other offered languages, so a mis-filed recording can be re-filed. */
  moveTargets: MoveTarget[];
  onChangeLanguage: (code: string) => void;

  onUploadVtt: () => void;
  onFetchTranscript: () => void;
  onEditCheckpoints: () => void;

  onPublish: () => void;
  onPublishOpen: () => void;
  onUnpublish: () => void;

  onRemove: () => void;
}

/**
 * The number, or a tick once the step is behind you.
 *
 * Colour is never the only signal: the step's own heading carries its name and
 * every state line below it is written out, so this is reinforcement rather than
 * the carrier of meaning.
 */
function StepMarker({ index, done, blocked }: { index: number; done: boolean; blocked: boolean }) {
  const theme = useTheme();
  if (done) {
    return (
      <CheckCircleIcon
        sx={{ fontSize: 22, color: 'success.main', flexShrink: 0 }}
        aria-hidden
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: blocked ? 'text.disabled' : 'primary.main',
        bgcolor: blocked
          ? alpha(theme.palette.text.primary, 0.06)
          : alpha(theme.palette.primary.main, 0.12),
      }}
    >
      {index}
    </Box>
  );
}

function Step({
  index,
  label,
  done,
  blocked,
  children,
}: {
  index: number;
  label: string;
  done: boolean;
  blocked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.25, py: 0.75 }}>
      <StepMarker index={index} done={done} blocked={!!blocked} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            display: 'block',
            color: blocked ? 'text.disabled' : 'text.primary',
          }}
        >
          {label}
        </Typography>
        {children}
      </Box>
    </Box>
  );
}

/** The greyed line a step shows when an earlier step has not happened yet. */
function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
      {children}
    </Typography>
  );
}

export default function LanguageTrackRow({
  row,
  busy,
  isPasting,
  recordingUrl,
  onRecordingUrlChange,
  unreachable,
  onSearchVideo,
  onOpenPaste,
  onCancelPaste,
  onSubmitVideo,
  moveTargets,
  onChangeLanguage,
  onUploadVtt,
  onFetchTranscript,
  onEditCheckpoints,
  onPublish,
  onPublishOpen,
  onUnpublish,
  onRemove,
}: LanguageTrackRowProps) {
  const [showVttHelp, setShowVttHelp] = useState(false);
  /** Anchor for the move menu, or null when it is shut. */
  const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
  const track = row.track;

  const hasVideo = !!track;
  const hasCheckpoints = !!track && track.section_count > 0;
  const isPublished = !!track && track.status === 'published';
  const isYouTube = track?.video_source === 'youtube';

  return (
    <Box
      sx={{
        mb: 1.5,
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: row.state.live ? 'success.light' : 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* ── Header: which language, and where it stands ──────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {row.label}
        </Typography>
        {/* The state in words, not only in colour. */}
        <Chip size="small" color={row.state.colour} label={row.state.label} />
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, mb: 0.5 }}>
        {/* Every sentence names its own language, so a card read halfway down a
            scrolled dialog still says what it is. */}
        {row.state.detail(row.label)}
      </Typography>

      {/* ── Step 1: the video ────────────────────────────────────────────── */}
      <Step index={1} label="Video" done={hasVideo}>
        {hasVideo ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, wordBreak: 'break-word', minWidth: 0 }}
            >
              {describeRecordingUrl(track!.recording_url, track!.recording_file_name)}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={isYouTube ? 'YouTube' : 'SharePoint'}
              sx={{ height: 20, fontSize: '0.6875rem' }}
            />
            <Button
              size="small"
              variant="text"
              onClick={onSearchVideo}
              disabled={busy}
              sx={actionSx}
              aria-label={`Change the ${row.label} video`}
            >
              Change
            </Button>
            {/*
              Re-file, which is not the same as replace and sits next to it for
              exactly that reason. A recording that turned out to be in the other
              language is a mislabelled row, not the wrong video: Change would
              clear its checkpoints, and Remove would archive the transcript
              along with them. This keeps all of it and moves the label.
            */}
            {moveTargets.length > 0 && (
              <Button
                size="small"
                variant="text"
                color="inherit"
                startIcon={<SwapHorizRoundedIcon />}
                onClick={(e) => setMoveAnchor(e.currentTarget)}
                disabled={busy}
                sx={{ ...actionSx, color: 'text.secondary' }}
                aria-haspopup="menu"
                aria-expanded={!!moveAnchor}
                aria-label={`Move the ${row.label} recording to another language`}
              >
                Move
              </Button>
            )}
            <Menu
              anchorEl={moveAnchor}
              open={!!moveAnchor}
              onClose={() => setMoveAnchor(null)}
              MenuListProps={{ 'aria-label': 'Move this recording to' }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', px: 2, pt: 0.5, pb: 1, maxWidth: 260 }}
              >
                Move this recording, with its transcript and checkpoints, to:
              </Typography>
              {moveTargets.map((target) => (
                <MenuItem
                  key={target.code}
                  disabled={target.taken}
                  /**
                   * No handler at all when it is taken, rather than relying on
                   * `disabled`. A MenuItem renders as an <li>, which cannot
                   * carry the DOM disabled attribute, so MUI marks it
                   * aria-disabled and blocks it with pointer-events. That stops
                   * a mouse and does not stop a click that reaches it any other
                   * way, which is a fine distinction to leave in a control whose
                   * whole job is refusing an operation the API will reject.
                   */
                  onClick={
                    target.taken
                      ? undefined
                      : () => {
                          setMoveAnchor(null);
                          onChangeLanguage(target.code);
                        }
                  }
                  sx={{ minHeight: 48, display: 'block', py: 1 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {target.label}
                  </Typography>
                  {/* The reason, next to the thing it disables. A greyed row with
                      no explanation reads as broken rather than as occupied. */}
                  {target.taken && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Already has a recording
                    </Typography>
                  )}
                </MenuItem>
              ))}
            </Menu>
          </Box>
        ) : (
          !isPasting && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
              <Button
                size="small"
                variant="contained"
                startIcon={<SearchRoundedIcon />}
                onClick={onSearchVideo}
                disabled={busy}
                sx={actionSx}
              >
                Search SharePoint or OneDrive
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<LinkRoundedIcon />}
                onClick={onOpenPaste}
                disabled={busy}
                sx={actionSx}
              >
                Paste a link
              </Button>
            </Box>
          )
        )}

        {/* The link field opens inside its own language's step, so the language
            being filled in is never in doubt. */}
        <Collapse in={isPasting} unmountOnExit>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <TextField
              size="small"
              label={`${row.label} recording link`}
              placeholder="A SharePoint, OneDrive or YouTube link"
              value={recordingUrl}
              onChange={(e) => onRecordingUrlChange(e.target.value)}
              fullWidth
              autoFocus
              helperText={`Paste the link to this chapter's ${row.label} class recording.`}
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={() => onSubmitVideo()}
                disabled={busy || !recordingUrl.trim()}
                sx={actionSx}
              >
                {busy ? 'Adding...' : `Add ${row.label}`}
              </Button>
              <Button onClick={onCancelPaste} sx={actionSx}>
                Cancel
              </Button>
            </Box>
            {/* Offered only after the server has actually refused this link, so
                it can never be pressed as a way of skipping a check that would
                have passed. */}
            {unreachable && (
              <Button
                size="small"
                variant="text"
                color="warning"
                onClick={() => onSubmitVideo({ force: true })}
                disabled={busy || !recordingUrl.trim()}
                sx={actionSx}
              >
                Attach it anyway
              </Button>
            )}
          </Box>
        </Collapse>
      </Step>

      {/* ── Step 2: the transcript, which is what makes checkpoints ──────── */}
      <Step index={2} label="Transcript" done={hasCheckpoints} blocked={!hasVideo}>
        {!hasVideo ? (
          <Waiting>Add the video first.</Waiting>
        ) : hasCheckpoints ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {track!.section_count} checkpoint{track!.section_count === 1 ? '' : 's'}
            </Typography>
            <Button
              size="small"
              variant="text"
              startIcon={<EditNoteIcon />}
              onClick={onEditCheckpoints}
              disabled={busy}
              sx={actionSx}
            >
              Edit
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={busy ? <CircularProgress size={14} /> : <UploadFileIcon />}
              onClick={onUploadVtt}
              disabled={busy}
              sx={actionSx}
            >
              Replace
            </Button>
          </Box>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Checkpoints come from the transcript. Skip this and the recording can still go out as
              an open one.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                size="small"
                variant="contained"
                startIcon={busy ? <CircularProgress size={14} /> : <UploadFileIcon />}
                onClick={onUploadVtt}
                disabled={busy}
                sx={actionSx}
              >
                Upload transcript (.vtt)
              </Button>
              {/* Worth one press only when a transcript was stored on an earlier
                  attempt, and pointless for a YouTube track, which has no
                  SharePoint folder to search. */}
              {!isYouTube && (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={onFetchTranscript}
                  disabled={busy}
                  sx={actionSx}
                >
                  Try fetching it
                </Button>
              )}
              <Button
                size="small"
                variant="text"
                startIcon={<HelpOutlineIcon />}
                onClick={() => setShowVttHelp((v) => !v)}
                sx={{ ...actionSx, color: 'text.secondary' }}
                aria-expanded={showVttHelp}
              >
                Where do I get one?
              </Button>
            </Box>
            <Collapse in={showVttHelp}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
                sx={{ mt: 0.75 }}
              >
                Open the recording in Teams or Stream, open the <strong>Transcript</strong> panel,
                then choose <strong>Download</strong> and pick the <strong>.vtt</strong> format. If
                the class was never recorded through Teams there is no transcript to download. You
                can still publish the recording as open and add checkpoints later. Each language
                needs its own: they are different recordings.
              </Typography>
            </Collapse>
          </>
        )}
      </Step>

      {/* ── Step 3: what a student actually gets ─────────────────────────── */}
      <Step index={3} label="Publish" done={isPublished} blocked={!hasVideo}>
        {!hasVideo ? (
          <Waiting>Add the video first.</Waiting>
        ) : isPublished ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {row.state.live ? 'Students can watch it' : 'Published, but held back'}
            </Typography>
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<PublishRoundedIcon />}
              onClick={onUnpublish}
              disabled={busy}
              sx={actionSx}
            >
              Unpublish
            </Button>
          </Box>
        ) : hasCheckpoints ? (
          <Button
            size="small"
            variant="contained"
            startIcon={<PublishRoundedIcon />}
            onClick={onPublish}
            disabled={busy}
            sx={{ ...actionSx, mt: 0.5 }}
          >
            Publish
          </Button>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              No checkpoints yet, so this goes out as an open recording: watchable, and it does not
              unlock the chapter test.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<VisibilityOutlinedIcon />}
              onClick={onPublishOpen}
              disabled={busy}
              sx={actionSx}
            >
              Publish as open
            </Button>
          </>
        )}
      </Step>

      {/* Out of the header row it used to share with nothing but a title: a
          one-way door does not belong a thumb-width from the language name. */}
      {hasVideo && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
          <Button
            size="small"
            variant="text"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove the ${row.label} recording`}
            sx={actionSx}
          >
            Remove
          </Button>
        </Box>
      )}
    </Box>
  );
}
