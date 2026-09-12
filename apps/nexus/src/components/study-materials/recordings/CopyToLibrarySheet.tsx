'use client';

/**
 * "Copy into the Neram library?", the copy running, and what went wrong.
 *
 * For a teacher whose recording is in their own OneDrive and who has never used
 * SharePoint, this sheet is the whole move: which file, where it goes, that the
 * original stays, that nothing students did is lost, and how far it has got.
 * A copy of an hour-long class can take minutes, so the progress can be hidden
 * and the page carries on; the card shows the percent and reopens this.
 *
 * Presentational: RecordingsWorkspace starts the copy, polls it and attaches
 * the result.
 */

import { Alert, Box, Button, CircularProgress, LinearProgress, Typography } from '@neram/ui';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ResponsiveSheet from './ResponsiveSheet';
import { formatTimecode } from '@/lib/timecode';
import { formatBytes } from './recordings-api';

export type CopyPhase =
  | { phase: 'confirm' }
  | { phase: 'starting' }
  | { phase: 'copying'; percent: number | null }
  | { phase: 'attaching' }
  | { phase: 'failed'; message: string };

export interface CopyToLibraryFile {
  name: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}

export interface CopyToLibrarySheetProps {
  open: boolean;
  /** The language, e.g. "தமிழ்". */
  label: string;
  file: CopyToLibraryFile | null;
  /** "NeramStorage › nexus › class-videos › Ch 1 History Of Architecture". */
  destination: string;
  /** The language already has a recording, whose checkpoints the copy keeps. */
  keepsCheckpoints: boolean;
  status: CopyPhase;
  onClose: () => void;
  /** Start the copy, or start it again after a failure. */
  onCopy: () => void;
  onChooseAnother: () => void;
}

function FileRow({ file }: { file: CopyToLibraryFile }) {
  const meta = [file.durationSeconds ? formatTimecode(file.durationSeconds) : '', formatBytes(file.sizeBytes)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Box
        aria-hidden
        sx={{
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: 1.5,
          bgcolor: 'grey.100',
          color: 'text.secondary',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <MovieOutlinedIcon />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
          {file.name}
        </Typography>
        {meta && (
          <Typography variant="body2" color="text.secondary">
            {meta}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function Assurance({ children }: { children: React.ReactNode }) {
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', listStyle: 'none' }}>
      <CheckCircleRoundedIcon aria-hidden sx={{ fontSize: 20, color: 'success.main', mt: '1px' }} />
      <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function CopyToLibrarySheet({
  open,
  label,
  file,
  destination,
  keepsCheckpoints,
  status,
  onClose,
  onCopy,
  onChooseAnother,
}: CopyToLibrarySheetProps) {
  const button = { textTransform: 'none' } as const;

  if (status.phase === 'copying') {
    const size = formatBytes(file?.sizeBytes);
    const percent = status.percent;
    return (
      <ResponsiveSheet
        open={open}
        onClose={onClose}
        title={`Copying the ${label} video`}
        actions={
          <Button onClick={onClose} sx={button}>
            Hide progress
          </Button>
        }
      >
        <Typography role="status" aria-live="polite" sx={{ fontWeight: 600, mt: 1 }}>
          {`Copying ${size ? `${size} ` : 'the video '}into the Neram library...${percent != null ? ` ${percent}%` : ''}`}
        </Typography>
        <LinearProgress
          variant={percent == null ? 'indeterminate' : 'determinate'}
          value={percent ?? undefined}
          aria-label="Copy progress"
          sx={{
            mt: 1.25,
            height: 8,
            borderRadius: 4,
            // A copy can run for minutes; a bar sliding the whole time is too much for anyone who asked for less motion.
            '@media (prefers-reduced-motion: reduce)': {
              '& .MuiLinearProgress-bar': { animation: 'none', transition: 'none' },
            },
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.55 }}>
          Keep this page open and Nexus attaches it when the copy finishes. If you leave, the copy still finishes.
          Press Copy to Neram library again to use it.
        </Typography>
      </ResponsiveSheet>
    );
  }

  if (status.phase === 'attaching') {
    return (
      <ResponsiveSheet open={open} onClose={onClose} disableClose title="Attaching the copy">
        <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            {`Copied. Attaching it to the ${label} recording...`}
          </Typography>
        </Box>
      </ResponsiveSheet>
    );
  }

  if (status.phase === 'failed') {
    return (
      <ResponsiveSheet
        open={open}
        onClose={onClose}
        title="The copy did not finish"
        actions={
          <>
            <Button onClick={onChooseAnother} sx={button}>
              Choose another video
            </Button>
            <Button variant="contained" onClick={onCopy} sx={{ ...button, fontWeight: 700 }}>
              Try again
            </Button>
          </>
        }
      >
        <Alert severity="warning" sx={{ mt: 1 }}>
          {status.message}
        </Alert>
      </ResponsiveSheet>
    );
  }

  const starting = status.phase === 'starting';
  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={starting}
      title="Copy into the Neram library?"
      description={`Nexus copies the ${label} video into the shared Neram library, so it stays available whoever recorded it.`}
      actions={
        <>
          <Button onClick={onClose} disabled={starting} sx={button}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onCopy}
            disabled={starting}
            startIcon={starting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ ...button, fontWeight: 700 }}
          >
            {starting ? 'Starting the copy...' : 'Copy video'}
          </Button>
        </>
      }
    >
      <Box sx={{ mt: 1.5, display: 'grid', gap: 2 }}>
        {file && <FileRow file={file} />}

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            It goes to
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 0.5 }}>
            <FolderOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary', mt: '1px' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
              {destination}
            </Typography>
          </Box>
        </Box>

        <Box component="ul" sx={{ m: 0, p: 0, display: 'grid', gap: 0.75 }}>
          <Assurance>The original stays where it is.</Assurance>
          {keepsCheckpoints && <Assurance>Checkpoints and student progress are kept.</Assurance>}
        </Box>
      </Box>
    </ResponsiveSheet>
  );
}
