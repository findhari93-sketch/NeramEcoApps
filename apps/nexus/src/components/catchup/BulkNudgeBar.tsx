'use client';

/**
 * Chase a whole group in one press.
 *
 * With sixty-eight students in a single state, nudging them one button at a time
 * is not a workflow. The API has always taken arrays, so this is a UI gap rather
 * than a missing capability.
 *
 * It is also the one outward-facing action on this screen: pressing it sends
 * real email and a real Teams message to real students. So it confirms first, it
 * says the number out loud, it says what the student will receive, and it caps a
 * single press.
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';

/**
 * One press caps here, matching MAX_NUDGES_PER_RUN in the overdue cron. The cap
 * is the cron's for a reason: the two send down the same path, and a limit the
 * automated sender respects is not one a person should be able to walk past by
 * pressing a button.
 */
export const MAX_BULK_NUDGE = 40;

export interface BulkNudgeBarProps {
  count: number;
  onClear: () => void;
  onConfirm: () => void;
  sending: boolean;
}

export default function BulkNudgeBar({ count, onClear, onConfirm, sending }: BulkNudgeBarProps) {
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);
  const capped = count > MAX_BULK_NUDGE;

  return (
    <>
      <Box
        role="region"
        aria-label="Selected students"
        sx={{
          position: 'sticky',
          // Clear of the phone's bottom navigation, which is 56px plus the home
          // indicator on iOS.
          bottom: { xs: 'calc(56px + env(safe-area-inset-bottom))', md: 16 },
          zIndex: 6,
          mt: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          borderRadius: 3,
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.35),
          bgcolor: 'background.paper',
          boxShadow: theme.shadows[6],
        }}
      >
        <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '0.85rem' }} aria-live="polite">
          {count} selected
        </Typography>
        <Button onClick={onClear} sx={{ textTransform: 'none', minHeight: 44 }}>
          Clear
        </Button>
        <Button
          variant="contained"
          disabled={sending || count === 0}
          onClick={() => setConfirming(true)}
          startIcon={<NotificationsActiveOutlinedIcon />}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Nudge {Math.min(count, MAX_BULK_NUDGE)}
        </Button>
      </Box>

      <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          Send a catch-up nudge to {Math.min(count, MAX_BULK_NUDGE)} students?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.9rem' }}>
            Each of them gets an email and a Teams message saying they have classes waiting on
            their catch-up list. It also stops this week&apos;s automatic reminder, so nobody is
            messaged twice.
          </DialogContentText>
          {capped && (
            <DialogContentText sx={{ mt: 1.5, fontSize: '0.85rem', color: 'warning.dark' }}>
              You selected {count}. Only the first {MAX_BULK_NUDGE} will be sent this time, which is
              the same limit the automatic reminder works to. Send again for the rest.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirming(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={sending}
            onClick={() => {
              setConfirming(false);
              onConfirm();
            }}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
