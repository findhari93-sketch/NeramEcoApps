'use client';

import { forwardRef, type ComponentProps, type Ref } from 'react';
import { Box, Dialog, Slide, useMediaQuery } from '@neram/ui';
import PracticeReader from './PracticeReader';
import { useReaderSwipe } from './useReaderSwipe';

type SlideProps = ComponentProps<typeof Slide>;

// Nexus does not depend on @mui/material directly, so the transition's props
// are taken from Slide itself rather than from @mui/material/transitions.
const SlideUp = forwardRef(function SlideUp(props: SlideProps, ref: Ref<unknown>) {
  return <Slide {...props} direction="up" ref={ref} />;
});

type ReaderProps = ComponentProps<typeof PracticeReader>;

interface MobileReaderDialogProps extends Omit<ReaderProps, 'variant'> {
  open: boolean;
  /** After the slide-out, so the list can show where the student stopped. */
  onExited: () => void;
}

/**
 * The phone's question reader: full screen, over the list, which stays mounted
 * underneath so its scroll position survives.
 *
 * Opening it adds a history entry, so the phone's Back button closes it rather
 * than leaving the practice screen, and Prev / Next inside it replace that entry
 * rather than piling up a step for every question. It covers the bottom nav and
 * the report-a-problem button, and keeps its own action bar clear of the home
 * indicator.
 */
export default function MobileReaderDialog({ open, onExited, onClose, ...reader }: MobileReaderDialogProps) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const swipe = useReaderSwipe(
    () => {
      if (reader.hasNext) reader.onNext();
    },
    () => {
      if (reader.hasPrev) reader.onPrev();
    },
    open,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      TransitionComponent={SlideUp}
      transitionDuration={reduceMotion ? 0 : { enter: 225, exit: 195 }}
      TransitionProps={{ onExited }}
      // On the paper, which carries role="dialog". An aria-label on Dialog
      // itself lands on the wrapper, and the dialog is announced nameless.
      PaperProps={{ 'aria-label': 'Question reader', sx: { bgcolor: 'background.paper' } } as object}
    >
      <Box
        onTouchStart={swipe.onTouchStart}
        onTouchEnd={swipe.onTouchEnd}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <PracticeReader {...reader} variant="screen" onClose={onClose} />
      </Box>
    </Dialog>
  );
}
