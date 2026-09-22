'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import { matchVideoLinks, type VideoMatchRow } from '@/lib/video-link-matcher';

export interface VideoPasteDialogProps {
  open: boolean;
  onClose: () => void;
  /** The paper's rows, numbered as the list shows them. */
  rows: VideoMatchRow[];
  /** Fill the matched rows in as drafts. Nothing is saved here. */
  onApply: (text: string) => void;
}

const EXAMPLE = [
  'Q no 31 - Aptitude Solution',
  'https://youtu.be/U1X9MmLh-ZQ',
  'Q no 32 - Aptitude Solution',
  'https://youtu.be/x2fO__sSSzU',
].join('\n');

/**
 * Paste a whole list of solution videos at once.
 *
 * Takes the list the way teachers keep it: a line naming the question, the link
 * under it, gaps and blank lines allowed. The line under the box says what will
 * happen before anything does, and "Fill in" only fills the rows as unsaved
 * drafts, so the teacher still sees every link beside its question before Save.
 */
export default function VideoPasteDialog({ open, onClose, rows, onApply }: VideoPasteDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [text, setText] = useState('');

  const result = useMemo(() => (text.trim() ? matchVideoLinks(text, rows) : null), [text, rows]);
  const fillable = result ? result.matches.filter((m) => !m.unchanged).length : 0;

  const close = () => {
    setText('');
    onClose();
  };

  const apply = () => {
    onApply(text);
    setText('');
    onClose();
  };

  // text.primary for the cautious states: one theme's warning.dark is 3.8:1 on white.
  let status: { tone: 'text.primary' | 'success.dark'; text: string } | null = null;
  if (result) {
    if (result.mode === 'none') {
      status = { tone: 'text.primary', text: 'No video links found yet' };
    } else {
      const parts: string[] = [];
      if (result.mode === 'ordered') {
        parts.push('No question numbers found, so links go in line order: line 1 is Q1, line 2 is Q2.');
      }
      parts.push(`${result.matches.length} of ${result.linkCount} link${result.linkCount === 1 ? '' : 's'} matched to a question.`);
      const already = result.matches.length - fillable;
      if (already > 0) parts.push(`${already} already saved.`);
      if (result.unmatched.length > 0) {
        parts.push(`${result.unmatched.length} will be skipped (the reasons show after Fill in).`);
      }
      status = {
        tone: result.unmatched.length > 0 || result.mode === 'ordered' ? 'text.primary' : 'success.dark',
        text: parts.join(' '),
      };
    }
  }

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} maxWidth="md" fullWidth aria-labelledby="video-paste-title">
      <DialogTitle id="video-paste-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <ContentPasteIcon sx={{ color: 'primary.main' }} aria-hidden />
        <Box component="span" sx={{ flex: 1 }}>
          Paste a list of video links
        </Box>
        <IconButton aria-label="Close" onClick={close} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Paste your list as it is. Each link goes to the question number written next to it or on
          the line above it, like this:
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            mb: 2,
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
            fontSize: '0.8rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {EXAMPLE}
        </Box>

        <TextField
          label="Your list"
          multiline
          minRows={8}
          maxRows={16}
          fullWidth
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputProps={{ spellCheck: false, 'aria-describedby': 'video-paste-status' }}
          sx={{ '& textarea': { fontFamily: 'monospace', fontSize: { xs: 16, sm: '0.85rem' }, lineHeight: 1.6 } }}
        />

        <Typography
          id="video-paste-status"
          role="status"
          variant="body2"
          sx={{ mt: 1, minHeight: 24, color: status?.tone ?? 'text.secondary', fontWeight: 600 }}
        >
          {status?.text ?? ''}
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Nothing is saved yet. The links fill in beside their questions so you can check them, then
          you press Save.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <Button onClick={close} sx={{ minHeight: 44, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={apply}
          disabled={!result || result.matches.length === 0}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {fillable > 0 ? `Fill in ${fillable} link${fillable === 1 ? '' : 's'}` : 'Fill in links'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
