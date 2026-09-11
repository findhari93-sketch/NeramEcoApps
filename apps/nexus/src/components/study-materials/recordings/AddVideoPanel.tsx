'use client';

/**
 * A language with no recording yet: where the video comes from, said once.
 *
 * Videos are never uploaded through Nexus. They live in the Neram SharePoint
 * library, so the two ways in are finding the file there or pasting its link,
 * and the third link opens the library folder in a new tab for a teacher who has
 * not put the video there yet.
 */

import { Box, Button, Stack, Typography, alpha } from '@neram/ui';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

export interface AddVideoPanelProps {
  label: string;
  busy: boolean;
  folderUrl: string | null;
  onFind: () => void;
  onPaste: () => void;
}

export default function AddVideoPanel({ label, busy, folderUrl, onFind, onPaste }: AddVideoPanelProps) {
  return (
    <Box
      sx={{
        border: '2px dashed',
        borderColor: 'divider',
        borderRadius: 3,
        px: { xs: 2.5, sm: 4 },
        py: { xs: 3.5, sm: 5 },
        textAlign: 'center',
        maxWidth: 640,
        mx: 'auto',
      }}
    >
      <Box
        aria-hidden
        sx={{
          mx: 'auto',
          mb: 1.5,
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
        }}
      >
        <VideoLibraryOutlinedIcon />
      </Box>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1.125rem', mb: 0.75 }}>
        Add the {label} class recording
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 440, mx: 'auto', lineHeight: 1.6 }}>
        Videos are not uploaded to Nexus. Put the recording in the Neram SharePoint library first, then pick it
        here.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="center">
        <Button
          variant="contained"
          startIcon={<SearchRoundedIcon />}
          onClick={onFind}
          disabled={busy}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
        >
          Find video in SharePoint
        </Button>
        <Button
          variant="outlined"
          startIcon={<LinkRoundedIcon />}
          onClick={onPaste}
          disabled={busy}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          Paste a SharePoint link
        </Button>
      </Stack>

      {folderUrl && (
        <Button
          component="a"
          href={folderUrl}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewRoundedIcon fontSize="small" />}
          sx={{ mt: 1.5, minHeight: 44, textTransform: 'none' }}
        >
          Open the Class videos folder
        </Button>
      )}
    </Box>
  );
}
