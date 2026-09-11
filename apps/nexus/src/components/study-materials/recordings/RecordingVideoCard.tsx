'use client';

/**
 * The video on one language's recording: what it is, where it lives, and whether
 * it may be used, with the video playable in place.
 *
 * It replaces a line that read "DispForm.aspx" beside a "SharePoint" chip, with
 * "Change" and "Move" buttons nobody could explain. Now:
 *   - the name is the file's real name, from SharePoint;
 *   - the folder and length say which copy it is;
 *   - pressing the picture plays it, through the same route students are served
 *     by, so "plays here" means "plays for students";
 *   - "Replace video" says what it does, and moving a recording to another
 *     language is named after that language and says what it keeps.
 *
 * Presentational: the caller fetches the thumbnail and owns the player, so this
 * can be tested without a network.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import { formatTimecode } from '@/lib/timecode';
import { videoItemMessage } from '@/lib/recording-messages';
import { describeRecordingUrl } from '@/lib/chapter-recordings';
import { videoProblem, type RecordingTrackView } from '@/lib/recording-flow';
import { formatBytes, formatFolderPath } from './recordings-api';

export interface MoveTarget {
  code: string;
  label: string;
  /** Already has a recording, so the move would collide. Shown, not hidden. */
  taken: boolean;
}

export interface RecordingVideoCardProps {
  label: string;
  track: RecordingTrackView;
  thumbnailUrl: string | null;
  /** The player, once the teacher has pressed play. Shown in place of the picture. */
  player: React.ReactNode | null;
  onPlay: () => void;
  onReplace: () => void;
  moveTargets: MoveTarget[];
  onMove: (code: string) => void;
  onRemove: () => void;
  busy?: boolean;
}

export default function RecordingVideoCard({
  label,
  track,
  thumbnailUrl,
  player,
  onPlay,
  onReplace,
  moveTargets,
  onMove,
  onRemove,
  busy = false,
}: RecordingVideoCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const recording = track.recording ?? null;
  const name = recording?.name || describeRecordingUrl(track.recording_url, track.recording_file_name);
  const duration = recording?.duration_seconds ?? track.video_duration_seconds ?? null;
  const meta = [
    formatFolderPath(recording?.folder_path),
    duration ? formatTimecode(duration) : '',
    formatBytes(recording?.size_bytes),
  ].filter(Boolean);
  const problem = videoProblem(track);
  const unchecked = recording?.problem === 'UNRESOLVED';
  const webUrl = recording?.web_url || track.recording_url;

  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box component="section" aria-label={`${label} video`}>
      {/* The picture, or the player once it has been pressed. */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'grey.900',
        }}
      >
        {player ?? (
          <>
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <MovieOutlinedIcon aria-hidden sx={{ fontSize: 48, color: 'grey.600' }} />
              </Box>
            )}
            <Box
              component="button"
              type="button"
              onClick={onPlay}
              aria-label={`Play the ${label} recording`}
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                border: 0,
                p: 0,
                cursor: 'pointer',
                background: 'linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0) 50%)',
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: -3 },
                '&:hover .play-disc': { bgcolor: 'common.white' },
              }}
            >
              <Box
                className="play-disc"
                aria-hidden
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.88)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'grey.900',
                  boxShadow: 3,
                  transition: 'background-color 150ms',
                }}
              >
                <PlayArrowRoundedIcon sx={{ fontSize: 40 }} />
              </Box>
              {duration ? (
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: 'rgba(0,0,0,0.78)',
                    color: 'common.white',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  {formatTimecode(duration)}
                </Box>
              ) : null}
            </Box>
          </>
        )}
      </Box>

      {/* What it is and where it lives. */}
      <Typography component="p" sx={{ mt: 1.5, fontWeight: 700, fontSize: '1rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
        {name}
      </Typography>
      {meta.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {meta.join(' · ')}
        </Typography>
      )}

      {/* Whether it may be used, with the fix beside the reason. */}
      {problem ? (
        <Alert
          severity="warning"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" onClick={onReplace} disabled={busy} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              Replace video
            </Button>
          }
        >
          {videoItemMessage(problem, { name })}
        </Alert>
      ) : unchecked ? (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 1, color: 'text.secondary' }}>
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px' }} />
          <Typography variant="body2">{videoItemMessage('UNRESOLVED')}</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
          <CheckCircleRoundedIcon aria-hidden sx={{ fontSize: 18, color: 'success.main' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
            Students can play this
          </Typography>
        </Box>
      )}

      {/* What can be done with it. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>
        {webUrl && (
          <Button
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<OpenInNewRoundedIcon />}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Open in SharePoint
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<SwapHorizRoundedIcon />}
          onClick={onReplace}
          disabled={busy}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Replace video
        </Button>
        <Box sx={{ flex: 1 }} />
        <IconButton
          aria-label={`More actions for the ${label} recording`}
          aria-haspopup="menu"
          aria-expanded={!!menuAnchor}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          disabled={busy}
          sx={{ width: 48, height: 48 }}
        >
          <MoreVertRoundedIcon />
        </IconButton>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
        MenuListProps={{ 'aria-label': `${label} recording actions` }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {moveTargets.map((target) => (
          <MenuItem
            key={target.code}
            disabled={target.taken}
            // No handler at all when taken: a MenuItem is an <li>, which cannot
            // carry the DOM disabled attribute, so `disabled` alone does not stop
            // every way a click can arrive.
            onClick={
              target.taken
                ? undefined
                : () => {
                    closeMenu();
                    onMove(target.code);
                  }
            }
            sx={{ minHeight: 56, alignItems: 'flex-start', whiteSpace: 'normal', maxWidth: 320 }}
          >
            <ListItemIcon sx={{ mt: 0.5 }}>
              <TranslateRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={`Move to ${target.label}`}
              secondary={target.taken ? `${target.label} already has a video` : 'Keeps its transcript and checkpoints'}
            />
          </MenuItem>
        ))}
        {moveTargets.length > 0 && <Divider />}
        <MenuItem
          onClick={() => {
            closeMenu();
            onRemove();
          }}
          sx={{ minHeight: 48, color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'error.main' }}>
            <DeleteOutlineRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Remove recording" />
        </MenuItem>
      </Menu>
    </Box>
  );
}
