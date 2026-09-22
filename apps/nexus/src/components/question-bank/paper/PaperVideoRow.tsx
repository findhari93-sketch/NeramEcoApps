'use client';

import { memo, type Ref } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import type { NexusQBQuestion } from '@neram/database';
import { solutionVideosOf } from '@neram/database';
import MathText from '@/components/common/MathText';
import SolutionVideoField from '../SolutionVideoField';
import type { VideoRowState } from '@/hooks/useVideoLinkDrafts';

export interface PaperVideoRowProps {
  question: NexusQBQuestion;
  /** The number the list shows: display_order, else paper position. */
  number: number;
  value: string;
  state: VideoRowState;
  errorText: string | null;
  /** Open in the side pane. */
  active: boolean;
  onChange: (value: string) => void;
  onActivate: () => void;
  onEnter: () => void;
  onBulkPaste: (text: string) => void;
  inputRef: Ref<HTMLInputElement>;
}

/**
 * One question in Videos mode: what it asks, and its link.
 *
 * The stem is there so a teacher can see which question a link is going onto
 * without opening it, and tapping it opens the full question (figures and all)
 * in the pane, for the ones where the first line is not enough.
 *
 * Phone: the stem clamped to two lines, the field under it at full width.
 * From md up: one line, stem then field.
 */
function PaperVideoRow({
  question,
  number,
  value,
  state,
  errorText,
  active,
  onChange,
  onActivate,
  onEnter,
  onBulkPaste,
  inputRef,
}: PaperVideoRowProps) {
  const pending = state === 'draft-new' || state === 'draft-replace' || state === 'draft-clear';
  const problem = state === 'invalid' || state === 'error';
  const rule = problem ? 'error.main' : pending || active ? 'primary.main' : 'transparent';

  return (
    <Box
      data-question-id={question.id}
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { xs: 'stretch', md: 'center' },
        gap: { xs: 0.5, md: 1.5 },
        px: 1,
        py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        borderLeft: '3px solid',
        borderLeftColor: rule,
        bgcolor: active ? 'primary.50' : 'transparent',
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        aria-label={`Open question ${number}`}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        sx={{
          flex: { md: 1 },
          minWidth: 0,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          borderRadius: 1,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 28, flexShrink: 0 }}>
          {number}
        </Typography>
        <MathText
          text={question.question_text || '(no text)'}
          variant="body2"
          sx={{
            flex: 1,
            minWidth: 0,
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: { xs: 2, md: 1 },
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        />
      </Box>

      {/* Full width on a phone: at 375px every pixel of indent is a character of
          the link the teacher cannot see. */}
      <Box sx={{ width: { xs: '100%', md: 420 }, flexShrink: 0, boxSizing: 'border-box' }}>
        {state === 'split' ? (
          <SplitDrawingNote question={question} number={number} onOpen={onActivate} />
        ) : (
          <SolutionVideoField
            label={`Video for question ${number}`}
            value={value}
            onChange={onChange}
            status={state === 'draft-clear' ? 'removing' : pending ? 'unsaved' : null}
            errorText={state === 'error' ? errorText : null}
            onEnter={onEnter}
            onBulkPaste={onBulkPaste}
            inputRef={inputRef}
          />
        )}
      </Box>
    </Box>
  );
}

/**
 * A drawing split into parts keeps one video per part, set in the question
 * editor. Writing a single question-level link here would be overwritten by the
 * next editor save, so the row sends the teacher there instead.
 */
function SplitDrawingNote({
  question,
  number,
  onOpen,
}: {
  question: NexusQBQuestion;
  number: number;
  onOpen: () => void;
}) {
  const withVideo = solutionVideosOf(question).length;
  const parts = Array.isArray((question.drawing_parts as { items?: unknown[] } | null)?.items)
    ? (question.drawing_parts as { items: unknown[] }).items.length
    : 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 44 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
        Videos are set per part: {withVideo} of {parts} have one
      </Typography>
      <Button
        variant="outlined"
        size="small"
        onClick={onOpen}
        aria-label={`Open question ${number} to set a video for each part`}
        sx={{ minHeight: 44, textTransform: 'none', flexShrink: 0 }}
      >
        Open
      </Button>
    </Box>
  );
}

export default memo(PaperVideoRow);
