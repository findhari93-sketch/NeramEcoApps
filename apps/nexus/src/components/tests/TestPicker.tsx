'use client';

/**
 * Pick an existing test from the library, as a dialog.
 *
 * ONE picker for every place a test gets linked: a study chapter, a class prep
 * gate, a classroom assignment. Before this, each surface had its own list (the
 * class prep dialog showed a flat, unsearchable dump of every repository test),
 * so the same test looked like a different thing depending on where you stood.
 *
 * The browsing itself lives in TestBrowser, which surfaces that already sit
 * inside a dialog embed directly rather than nesting modals.
 */

import { useEffect, useState } from 'react';
import {
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import TestBrowser, { type PickableTest } from './TestBrowser';

export type { PickableTest };

interface TestPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (test: PickableTest) => void;
  getToken: () => Promise<string | null>;
  title?: string;
  /** Copy for the confirm button, e.g. "Link to this chapter". */
  confirmLabel?: string;
  /** Restrict to specific test kinds. */
  kinds?: string[];
  /** Shown under the header, e.g. why some tests are missing. */
  hint?: string;
  /** Given, the picker offers a "Build a new test" escape hatch. */
  onBuildNew?: () => void;
}

export default function TestPicker({
  open,
  onClose,
  onPick,
  getToken,
  title = 'Choose a test',
  confirmLabel = 'Use this test',
  kinds,
  hint,
  onBuildNew,
}: TestPickerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [picked, setPicked] = useState<PickableTest | null>(null);

  // A picker that remembers the last pick is a picker that links the wrong test
  // to the next chapter.
  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile}>
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {hint && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {hint}
          </Typography>
        )}
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ position: 'absolute', right: 8, top: 8, minWidth: 44, minHeight: 44 }}
        >
          <CloseOutlinedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        <TestBrowser
          getToken={getToken}
          value={picked}
          onChange={setPicked}
          kinds={kinds}
          resetToken={open}
          onBuildNew={onBuildNew}
          maxListHeight={400}
        />
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        {onBuildNew && (
          <Button onClick={onBuildNew} sx={{ textTransform: 'none', minHeight: 44, mr: 'auto' }}>
            Build a new test
          </Button>
        )}
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!picked}
          onClick={() => picked && onPick(picked)}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
