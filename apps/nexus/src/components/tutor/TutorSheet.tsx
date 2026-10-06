'use client';

import { forwardRef, type ComponentProps, type Ref } from 'react';
import { Dialog, Slide, useMediaQuery } from '@neram/ui';
import TutorPanel from './TutorPanel';

type SlideProps = ComponentProps<typeof Slide>;

const SlideUp = forwardRef(function SlideUp(props: SlideProps, ref: Ref<unknown>) {
  return <Slide {...props} direction="up" ref={ref} />;
});

type PanelProps = Omit<ComponentProps<typeof TutorPanel>, 'variant'>;

/**
 * The phone's tutor: full screen, above the question reader, which stays
 * mounted underneath so "Try it myself" lands back on the same question with
 * its answer intact. The page owns the history entry (`tutor=1`), so the
 * phone's Back closes this and nothing else.
 */
export default function TutorSheet({ open, ...panel }: PanelProps & { open: boolean }) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <Dialog
      open={open}
      onClose={panel.onClose}
      fullScreen
      TransitionComponent={SlideUp}
      transitionDuration={reduceMotion ? 0 : { enter: 225, exit: 195 }}
      // On the paper, which carries role="dialog" (see MobileReaderDialog).
      PaperProps={{ 'aria-label': 'Tutor', sx: { bgcolor: 'background.paper', overscrollBehavior: 'contain' } } as object}
    >
      <TutorPanel {...panel} variant="sheet" />
    </Dialog>
  );
}
