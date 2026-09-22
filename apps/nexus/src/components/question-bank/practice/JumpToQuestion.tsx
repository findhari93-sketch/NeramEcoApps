'use client';

import { Box, IconButton, Popover, SwipeableDrawer, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusQBQuestionListItem } from '@neram/database';
import QuestionPalette from './QuestionPalette';

interface JumpToQuestionProps {
  /** A popover under the anchor on a laptop, a bottom sheet on a phone. */
  variant: 'popover' | 'sheet';
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  questions: NexusQBQuestionListItem[];
  numbers: Map<string, number>;
  currentId: string | null;
  onPick: (id: string) => void;
}

/**
 * "Q18 of 30", opened: the whole paper as numbers, to jump anywhere in it.
 *
 * On a phone this is the reader's way to reach question 25 without swiping
 * seven times or going back to the list.
 */
export default function JumpToQuestion({
  variant,
  anchor,
  open,
  onClose,
  questions,
  numbers,
  currentId,
  onPick,
}: JumpToQuestionProps) {
  const pick = (id: string) => {
    onPick(id);
    onClose();
  };

  const body = (
    <QuestionPalette questions={questions} numbers={numbers} currentId={currentId} onOpen={pick} autoReveal legend />
  );

  if (variant === 'popover') {
    return (
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 32px)', maxHeight: 440, p: 2, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Jump to a question
        </Typography>
        {body}
      </Popover>
    );
  }

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      // Above the full-screen reader it is opened from.
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '75svh',
          px: 2,
          pt: 1,
          pb: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        },
      }}
    >
      <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, flex: 1 }}>
          Jump to a question
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 48, height: 48 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ overflowY: 'auto', minHeight: 0 }}>{body}</Box>
    </SwipeableDrawer>
  );
}
