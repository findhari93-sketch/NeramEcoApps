'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Chip,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { NexusQBQuestion } from '@neram/database';
import { QB_QUESTION_STATUS_LABELS, QB_QUESTION_STATUS_COLORS } from '@neram/database';
import ImageUploadZone from './ImageUploadZone';
import type { ImageState } from '@/lib/bulk-upload-schema';
import type { SlotType, PendingImages } from '@/hooks/useBulkImageFlow';
import { getEffectiveImage } from '@/hooks/useBulkImageFlow';
import { questionImageSlots } from '@/lib/qb-image-needs';
import MathText from '@/components/common/MathText';

interface BulkImageQuestionCardProps {
  question: NexusQBQuestion;
  activeSlot: SlotType | null;
  onSlotFocus: (slot: SlotType) => void;
  onPendingChange: (slot: SlotType, image: ImageState | null) => void;
  getToken: () => Promise<string | null>;
  registerSlotRef: (questionId: string, slot: SlotType, el: HTMLElement | null) => void;
  pending: PendingImages;
  /**
   * Pin the tri-state `needs_image` verdict, overruling the keyword guess.
   * Undefined hides the control, for a caller that has not wired persistence.
   */
  onSetNeedsImage?: (value: boolean | null) => void;
}

export default function BulkImageQuestionCard({
  question,
  activeSlot,
  onSlotFocus,
  onPendingChange,
  getToken,
  registerSlotRef,
  pending,
  onSetNeedsImage,
}: BulkImageQuestionCardProps) {
  const theme = useTheme();
  const isMCQ = question.question_format === 'MCQ';

  /**
   * The one place this card decides what it is waiting for.
   *
   * It used to answer that three different ways: `hasAllImages` demanded a
   * picture in every MCQ option, so "how many rectangles are in the figure
   * below?" with the options 16, 14, 13, 12 was amber forever.
   */
  const slots = useMemo(
    () =>
      questionImageSlots(question, (slot) => !!getEffectiveImage(question, slot, pending)),
    [question, pending],
  );

  const wanted = slots.filter((s) => s.expected);
  const allDone = wanted.length > 0 && wanted.every((s) => s.filled);
  const someDone = wanted.some((s) => s.filled) && !allDone;

  const optionSlots = slots.filter((s) => s.kind === 'figure' && s.slot !== 'question');
  const solutionSlot = slots.find((s) => s.kind === 'solution');
  /**
   * Show the option grid when a picture is expected in one, or when one is
   * already there. A teacher can still open it by hand for the case the guess
   * missed, which is what the button below is for.
   */
  const [optionsForced, setOptionsForced] = useState(false);
  const showOptions =
    isMCQ && optionSlots.length > 0 && (optionsForced || optionSlots.some((s) => s.expected || s.filled));

  const borderColor = allDone
    ? theme.palette.success.main
    : someDone
      ? theme.palette.warning.main
      : 'transparent';

  const handleChange = useCallback(
    (slot: SlotType) => (image: ImageState | undefined) => {
      if (image) {
        onPendingChange(slot, image);
      } else {
        onPendingChange(slot, null);
      }
    },
    [onPendingChange]
  );

  // The solution slot is always shown when the question has one at all: it is
  // only appended for maths questions in the first place, so hiding it behind
  // the same "are the options pictures?" guess the option grid uses would hide
  // it on exactly the questions that must have it.
  const visibleSlots = showOptions
    ? slots
    : slots.filter((s) => s.slot === 'question' || s.kind === 'solution');

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, md: 2 },
        borderLeft: `4px solid ${borderColor}`,
        transition: 'border-color 0.2s',
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: '0.8rem',
          }}
        >
          Q{question.display_order}
        </Typography>
        <Chip
          label={question.question_format}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.65rem', height: 22 }}
        />
        <Chip
          label={QB_QUESTION_STATUS_LABELS[question.status]}
          size="small"
          sx={{
            bgcolor: QB_QUESTION_STATUS_COLORS[question.status] + '20',
            color: QB_QUESTION_STATUS_COLORS[question.status],
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 22,
          }}
        />
        <Box sx={{ flex: 1 }} />
        {allDone ? (
          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main' }} />
        ) : someDone ? (
          <WarningAmberIcon sx={{ fontSize: 18, color: 'warning.main' }} />
        ) : null}
      </Box>

      {/*
        The keyword guess is a default, not a verdict. One click here pins it
        either way, permanently, for this one question; nothing below in the
        card touches this row again once it's set.
      */}
      {onSetNeedsImage && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {question.needs_image == null ? 'Guessing from the wording:' : "Teacher's answer:"}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={question.needs_image}
            // MUI already returns null when the selected button is clicked again,
            // which is exactly "go back to guessing".
            onChange={(_, next) => onSetNeedsImage(next)}
            sx={{ height: 28 }}
          >
            <ToggleButton value={true} sx={{ px: 1, fontSize: '0.7rem', textTransform: 'none' }}>
              Needs a figure
            </ToggleButton>
            <ToggleButton value={false} sx={{ px: 1, fontSize: '0.7rem', textTransform: 'none' }}>
              No figure needed
            </ToggleButton>
          </ToggleButtonGroup>
          {question.needs_image != null && (
            <Tooltip title="Go back to guessing from the wording" arrow>
              <Button
                size="small"
                onClick={() => onSetNeedsImage(null)}
                sx={{ minHeight: 28, fontSize: '0.7rem', textTransform: 'none' }}
              >
                Reset
              </Button>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Question text preview */}
      {question.question_text && (
        <MathText
          text={question.question_text}
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            mb: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        />
      )}

      {/* Slot selector chips. Click to aim the next paste; these open no file picker. */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
        {visibleSlots.map(({ slot, label, expected, filled }) => {
          const isActive = activeSlot === slot;
          return (
            <Chip
              key={slot}
              label={label}
              size="small"
              variant={isActive ? 'filled' : 'outlined'}
              color={isActive ? 'primary' : filled ? 'success' : expected ? 'warning' : 'default'}
              onClick={(e) => {
                e.stopPropagation();
                onSlotFocus(slot);
              }}
              sx={{
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 26,
                cursor: 'pointer',
                // A slot nothing is expected in is still reachable, just not
                // asking for attention.
                opacity: expected || filled ? 1 : 0.55,
              }}
            />
          );
        })}
      </Box>

      {/* Question image slot */}
      <SlotWrapper
        questionId={question.id}
        slot="question"
        isActive={activeSlot === 'question'}
        registerRef={registerSlotRef}
        label="Question Image"
      >
        <ImageUploadZone
          image={getEffectiveImage(question, 'question', pending)}
          onChange={handleChange('question')}
          label="Paste or drop question image"
          height={160}
          getToken={getToken}
          enableGlobalPaste={activeSlot === 'question'}
          subfolder="questions"
        />
      </SlotWrapper>

      {/* Option image slots (MCQ only) */}
      {showOptions && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Option Images
          </Typography>
          <Box
            sx={{
              display: 'grid',
              // minmax(0, 1fr), not 1fr. A grid track defaults to
              // min-width: auto, so four "Image added / Replace / bin" rows that
              // refuse to shrink pushed the whole grid past the card edge.
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
              gap: 1,
            }}
          >
            {optionSlots.map(({ slot, label }) => (
              <SlotWrapper
                key={slot}
                questionId={question.id}
                slot={slot}
                isActive={activeSlot === slot}
                registerRef={registerSlotRef}
                label={`Option ${label}`}
              >
                <ImageUploadZone
                  image={getEffectiveImage(question, slot, pending)}
                  onChange={handleChange(slot)}
                  label={label}
                  height={80}
                  dense
                  getToken={getToken}
                  enableGlobalPaste={activeSlot === slot}
                  subfolder="options"
                />
              </SlotWrapper>
            ))}
          </Box>
        </Box>
      )}

      {/* The escape hatch for a paper whose option images the wording did not
          announce. Text options are the common case, so this stays a link. */}
      {isMCQ && !showOptions && optionSlots.length > 0 && (
        <Button
          size="small"
          onClick={() => setOptionsForced(true)}
          sx={{ mt: 1, textTransform: 'none', minHeight: 36 }}
        >
          The options are pictures too
        </Button>
      )}

      {/* The worked solution, in the assembly line rather than four clicks away
          in the Edit form. Forty maths questions is forty screenshots of a
          worked answer, which is the same paste-Tab-paste job the figures
          above already are. */}
      {solutionSlot && (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Solution Image
            </Typography>
            {solutionSlot.expected && !solutionSlot.filled && (
              <Typography variant="caption" color="warning.main" fontWeight={600}>
                required for maths
              </Typography>
            )}
          </Box>
          <SlotWrapper
            questionId={question.id}
            slot="solution"
            isActive={activeSlot === 'solution'}
            registerRef={registerSlotRef}
            label="Solution Image"
          >
            <ImageUploadZone
              image={getEffectiveImage(question, 'solution', pending)}
              onChange={handleChange('solution')}
              label="Paste or drop the worked solution"
              height={120}
              getToken={getToken}
              enableGlobalPaste={activeSlot === 'solution'}
              subfolder="solutions"
            />
          </SlotWrapper>
        </Box>
      )}
    </Paper>
  );
}

/** Wrapper that adds focus ring and ref registration — NO click handler (use chips instead) */
function SlotWrapper({
  questionId,
  slot,
  isActive,
  registerRef,
  label,
  children,
}: {
  questionId: string;
  slot: SlotType;
  isActive: boolean;
  registerRef: (questionId: string, slot: SlotType, el: HTMLElement | null) => void;
  label: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerRef(questionId, slot, ref.current);
    return () => registerRef(questionId, slot, null);
  }, [questionId, slot, registerRef]);

  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        // Without this the wrapper inherits min-width: auto from its grid track
        // and re-creates the overflow the minmax(0, 1fr) above just fixed.
        minWidth: 0,
        borderRadius: 1,
        border: isActive
          ? `2px solid ${theme.palette.primary.main}`
          : '2px solid transparent',
        transition: 'border-color 0.15s',
      }}
    >
      {isActive && (
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            top: -10,
            left: 8,
            bgcolor: theme.palette.primary.main,
            color: '#fff',
            px: 0.75,
            py: 0.1,
            borderRadius: 0.5,
            fontSize: '0.6rem',
            fontWeight: 600,
            zIndex: 1,
            lineHeight: 1.4,
          }}
        >
          {label}
        </Typography>
      )}
      {children}
    </Box>
  );
}
