'use client';

import { useEffect, useRef } from 'react';
import { Box, IconButton, Paper, Typography, useMediaQuery, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import type { NexusQBQuestion, NexusQBQuestionSource, QBQuestionSection } from '@neram/database';
import QuestionEditForm, { type PaperFallback } from './QuestionEditForm';
import BulkImageQuestionCard from '../BulkImageQuestionCard';
import type { SlotType, PendingImages } from '@/hooks/useBulkImageFlow';
import type { ImageState } from '@/lib/bulk-upload-schema';

/**
 * The paste-image mode's own props, kept in one bundle so the pane's main
 * prop list does not carry image plumbing it only needs in one mode.
 */
export interface ImagesPaneProps {
  activeSlot: SlotType | null;
  pending: PendingImages;
  onSlotFocus: (slot: SlotType) => void;
  onPendingChange: (slot: SlotType, image: ImageState | null) => void;
  registerSlotRef: (questionId: string, slot: SlotType, el: HTMLElement | null) => void;
  onSetNeedsImage: (value: boolean | null) => void;
}

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
  /** The open question's current tag ids. */
  tagIds?: string[];
  /** Paper numbers of the open question's either/or alternatives, if any. */
  choiceGroupSiblings?: number[];
  onUnlinkChoiceGroup?: () => void;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeSection: (questionId: string, section: QBQuestionSection) => Promise<void>;
  /** 'edit' shows the full question form; 'images' shows the paste assembly line. */
  mode?: 'edit' | 'images';
  imagesPane?: ImagesPaneProps;
}

/**
 * One question, filling the pane.
 *
 * Below md this is a full-screen sheet rather than a column: a two-pane split at
 * 375px gives each side about 180px, which is narrower than a single option of a
 * maths question.
 */
export default function PaperQuestionDetail({
  question, position, paper, sources, tagIds, choiceGroupSiblings, onUnlinkChoiceGroup,
  getToken, onSaved, onClose, onPrevious, onNext, onChangeSection,
  mode = 'edit', imagesPane,
}: PaperQuestionDetailProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const scrollRef = useRef<HTMLDivElement>(null);

  // The direct fix for "I open Q91 and I'm scrolled to the bottom of the
  // page with the stem off the top of the screen". A pane that keeps its
  // scroll offset between questions reproduces the same complaint one
  // question later, so this has to run on every question change, not just
  // mount.
  useEffect(() => {
    // Optional-chained on the call, not just the ref: jsdom's Element has no
    // scrollTo at all, and a component that throws in an effect during a test
    // fails every test in the file, not just the ones about scrolling.
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [question?.id]);

  // The parent only mounts this component for a question that exists (see
  // the effect in PaperWorkspace), so this is a render race, not a steady
  // state: the id just changed and the new question has not arrived in props
  // yet. A blank Paper here is honest about that for one frame; it is not a
  // "nothing selected" empty state, which used to occupy half the screen
  // permanently whether or not that was true.
  if (!question || !position) {
    return <Paper variant="outlined" sx={{ height: '100%' }} />;
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

      <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 2 } }}>
        {/*
          key is load-bearing: it remounts the form when the teacher moves to
          another question, so a half-typed edit cannot leak across.
        */}
        {mode === 'images' && imagesPane ? (
          <BulkImageQuestionCard
            key={question.id}
            question={question}
            activeSlot={imagesPane.activeSlot}
            onSlotFocus={imagesPane.onSlotFocus}
            onPendingChange={imagesPane.onPendingChange}
            getToken={getToken}
            registerSlotRef={imagesPane.registerSlotRef}
            pending={imagesPane.pending}
            onSetNeedsImage={imagesPane.onSetNeedsImage}
          />
        ) : (
          <QuestionEditForm
            key={question.id}
            question={question}
            paper={paper}
            sources={sources}
            tagIds={tagIds}
            choiceGroupSiblings={choiceGroupSiblings}
            onUnlinkChoiceGroup={onUnlinkChoiceGroup}
            getToken={getToken}
            onSaved={onSaved}
            onCancel={onClose}
            onChangeSection={onChangeSection}
          />
        )}
      </Box>
    </Paper>
  );
}
