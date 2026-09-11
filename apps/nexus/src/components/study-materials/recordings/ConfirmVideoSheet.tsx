'use client';

/**
 * "Use this video?", with the real file in front of the teacher before anything
 * is saved: its picture, name, folder and length.
 *
 * When the language already has a recording this is also where a replacement is
 * explained. The same file moved keeps its checkpoints without a question. A file
 * of the same length is probably the same recording, so the teacher chooses. A
 * different recording says plainly that its checkpoints go.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@neram/ui';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import ResponsiveSheet from './ResponsiveSheet';
import { formatTimecode } from '@/lib/timecode';
import { formatBytes, formatFolderPath, type ResolveLinkResponse } from './recordings-api';

export interface ConfirmVideoSheetProps {
  open: boolean;
  label: string;
  /** Checking the link, or saving the choice. */
  busy: boolean;
  checking: boolean;
  resolved: ResolveLinkResponse | null;
  thumbnailUrl: string | null;
  error: string | null;
  errorCode: string | null;
  onClose: () => void;
  onChooseAnother: () => void;
  onConfirm: (opts: { keepCheckpoints: boolean }) => void;
  /** Offered only when SharePoint did not answer, never for a refused file. */
  onForce?: () => void;
}

export default function ConfirmVideoSheet({
  open,
  label,
  busy,
  checking,
  resolved,
  thumbnailUrl,
  error,
  errorCode,
  onClose,
  onChooseAnother,
  onConfirm,
  onForce,
}: ConfirmVideoSheetProps) {
  const [keep, setKeep] = useState<'keep' | 'fresh'>('keep');

  useEffect(() => {
    if (open) setKeep('keep');
  }, [open, resolved]);

  const sameAs = resolved?.same_as ?? null;
  const count = sameAs?.checkpoint_count ?? 0;
  const plural = count === 1 ? 'checkpoint' : 'checkpoints';

  if (error) {
    return (
      <ResponsiveSheet
        open={open}
        onClose={onClose}
        disableClose={busy}
        title="This video cannot be used"
        actions={
          <>
            {errorCode === 'RECORDING_UNREACHABLE' && onForce && (
              <Button onClick={onForce} disabled={busy} color="warning" sx={{ textTransform: 'none' }}>
                Attach it anyway
              </Button>
            )}
            <Button variant="contained" onClick={onChooseAnother} disabled={busy} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Choose another video
            </Button>
          </>
        }
      >
        <Alert severity="warning" sx={{ mt: 1 }}>
          {error}
        </Alert>
      </ResponsiveSheet>
    );
  }

  const item = resolved?.item ?? null;
  const meta = item
    ? [
        item.duration_seconds ? formatTimecode(item.duration_seconds) : '',
        formatBytes(item.size_bytes),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={busy}
      title={item ? `Use this video for ${label}?` : 'Checking the video in SharePoint'}
      actions={
        item ? (
          <>
            <Button onClick={onChooseAnother} disabled={busy} sx={{ textTransform: 'none' }}>
              Choose another
            </Button>
            <Button
              variant="contained"
              onClick={() => onConfirm({ keepCheckpoints: keep === 'keep' })}
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {busy ? 'Saving...' : 'Use this video'}
            </Button>
          </>
        ) : undefined
      }
    >
      {checking || !item ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }} aria-live="polite">
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Finding the file and reading its name and length.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 1 }}>
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              alignItems: 'center',
              p: 1.25,
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                width: { xs: 112, sm: 144 },
                aspectRatio: '16 / 9',
                borderRadius: 1.5,
                overflow: 'hidden',
                bgcolor: 'grey.900',
                display: 'grid',
                placeItems: 'center',
                color: 'grey.500',
              }}
            >
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <MovieOutlinedIcon aria-hidden />
              )}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{item.name}</Typography>
              {item.folder_path && (
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {formatFolderPath(item.folder_path)}
                </Typography>
              )}
              {meta && (
                <Typography variant="body2" color="text.secondary">
                  {meta}
                </Typography>
              )}
            </Box>
          </Box>

          {sameAs?.verdict === 'same' && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              This is the video already attached, in its new place.
              {count ? ` Its ${count} ${plural} stay as they are.` : ''}
            </Alert>
          )}

          {sameAs?.verdict === 'likely' && count > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Alert severity="info">
                This looks like the same recording
                {item.duration_seconds ? `: both run ${formatTimecode(item.duration_seconds)}` : ''}. If it is, its{' '}
                {count} {plural} still fit it.
              </Alert>
              <RadioGroup
                value={keep}
                onChange={(e) => setKeep(e.target.value as 'keep' | 'fresh')}
                aria-label="What happens to the checkpoints"
                sx={{ mt: 1 }}
              >
                <FormControlLabel
                  value="keep"
                  control={<Radio />}
                  label={`Keep the ${count} ${plural}`}
                  sx={{ minHeight: 44 }}
                />
                <FormControlLabel
                  value="fresh"
                  control={<Radio />}
                  label="Start over and create new ones"
                  sx={{ minHeight: 44 }}
                />
              </RadioGroup>
            </Box>
          )}

          {sameAs?.verdict === 'different' && count > 0 && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              This is a different recording, so the {count} {plural} made for the current video will be removed and
              the {label} recording goes back to draft.
            </Alert>
          )}
        </Box>
      )}
    </ResponsiveSheet>
  );
}
