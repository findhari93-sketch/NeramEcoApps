'use client';

import { Box, IconButton, Paper, Typography, useMediaQuery, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusQBQuestion, NexusQBQuestionSource, QBQuestionSection } from '@neram/database';
import QuestionEditForm, { type PaperFallback } from './QuestionEditForm';

export interface PaperQuestionDetailProps {
  question: NexusQBQuestion | null;
  position: { index: number; total: number } | null;
  /**
   * The paper being viewed, handed to the form for its Source panel. The pane is
   * the only route to that form now, so dropping it here is the same as deleting
   * the exam fallback: every question on a paper with no source rows would read
   * 'Not recorded'.
   */
  paper?: PaperFallback;
  /** The open question's source rows, the paper's own row first. */
  sources?: NexusQBQuestionSource[];
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeSection: (questionId: string, section: QBQuestionSection) => Promise<void>;
}

/**
 * One question, filling the pane.
 *
 * Below md this is a full-screen sheet rather than a column: a two-pane split at
 * 375px gives each side about 180px, which is narrower than a single option of a
 * maths question.
 */
export default function PaperQuestionDetail({
  question, position, paper, sources, getToken, onSaved, onClose, onPrevious, onNext, onChangeSection,
}: PaperQuestionDetailProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!question || !position) {
    return (
      <Paper variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Select a question to edit it
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      variant={isMobile ? 'elevation' : 'outlined'}
      elevation={isMobile ? 16 : 0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...(isMobile
          ? { position: 'fixed', inset: 0, zIndex: theme.zIndex.modal, borderRadius: 0 }
          : { height: '100%', position: 'sticky', top: 16 }),
      }}
    >
      {/*
        48px on the nav controls, not the 40px that `p: 1` around a 24px icon
        produces. These three are the only way through a paper on a phone, and
        40px is under both the 44px the mobile helper asserts and the 48px
        Material sets as the floor.
      */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <IconButton
          aria-label="Previous question"
          disabled={position.index <= 1}
          onClick={onPrevious}
          sx={{ p: 1, minWidth: 48, minHeight: 48 }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="body2" fontWeight={700}>
          {position.index} of {position.total}
        </Typography>
        <IconButton
          aria-label="Next question"
          disabled={position.index >= position.total}
          onClick={onNext}
          sx={{ p: 1, minWidth: 48, minHeight: 48 }}
        >
          <ChevronRightIcon />
        </IconButton>
        <Box sx={{ flex: 1 }} />
        <IconButton
          aria-label="Close question"
          onClick={onClose}
          sx={{ p: 1, minWidth: 48, minHeight: 48 }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 2 } }}>
        {/*
          key is load-bearing: it remounts the form when the teacher moves to
          another question, so a half-typed edit cannot leak across.
        */}
        <QuestionEditForm
          key={question.id}
          question={question}
          paper={paper}
          sources={sources}
          getToken={getToken}
          onSaved={onSaved}
          onCancel={onClose}
          onChangeSection={onChangeSection}
        />
      </Box>
    </Paper>
  );
}
