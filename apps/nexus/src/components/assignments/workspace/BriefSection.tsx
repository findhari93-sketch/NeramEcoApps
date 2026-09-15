'use client';

/**
 * The brief, in the panel. Open before anything is handed in, because then it is
 * what the student needs; folded away after, one tap from the review, because by
 * then the review is what they came for.
 */
import { useEffect, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Typography, useMediaQuery } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AssignmentBriefBody from '../AssignmentBriefBody';
import type { AssignmentRecording, StudentAssignmentDetail } from './types';

export default function BriefSection({
  detail,
  recording,
  startsOpen,
  onOpenAttachment,
  onOpenImage,
}: {
  detail: StudentAssignmentDetail;
  recording: AssignmentRecording;
  startsOpen: boolean;
  onOpenAttachment: (studyFileId: string) => void;
  onOpenImage: (src: string) => void;
}) {
  const [open, setOpen] = useState(startsOpen);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Handing a drawing in folds the brief away; nothing else overrides the student.
  useEffect(() => setOpen(startsOpen), [startsOpen]);

  return (
    <Accordion
      expanded={open}
      onChange={(_, v) => setOpen(v)}
      disableGutters
      elevation={0}
      TransitionProps={{ timeout: reducedMotion ? 0 : undefined, unmountOnExit: true }}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        '&::before': { display: 'none' },
        overflow: 'hidden',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="assignment-brief-content"
        id="assignment-brief-header"
        sx={{ minHeight: 52, px: 1.5, '& .MuiAccordionSummary-content': { my: 1 } }}
      >
        <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 800 }}>
          The brief
        </Typography>
      </AccordionSummary>
      <AccordionDetails id="assignment-brief-content" sx={{ px: 1.5, pt: 0, pb: 2 }}>
        <AssignmentBriefBody
          detail={detail}
          recording={recording}
          onOpenAttachment={onOpenAttachment}
          onOpenImage={onOpenImage}
          compactImages
        />
      </AccordionDetails>
    </Accordion>
  );
}
