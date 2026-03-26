'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { NexusQBQuestion, NexusQBQuestionOption } from '@neram/database';
import { QB_QUESTION_STATUS_LABELS, QB_QUESTION_STATUS_COLORS } from '@neram/database';
import ImageUploadZone from './ImageUploadZone';
import type { ImageState } from '@/lib/bulk-upload-schema';
import type { SlotType, PendingImages } from '@/hooks/useBulkImageFlow';
import { getEffectiveImage } from '@/hooks/useBulkImageFlow';

interface BulkImageQuestionCardProps {
  question: NexusQBQuestion;
  activeSlot: SlotType | null;
  onSlotFocus: (slot: SlotType) => void;
  onPendingChange: (slot: SlotType, image: ImageState | null) => void;
  getToken: () => Promise<string | null>;
  registerSlotRef: (questionId: string, slot: SlotType, el: HTMLElement | null) => void;
  pending: PendingImages;
}

function hasAllImages(question: NexusQBQuestion, pending: PendingImages): boolean {
  const qImg = getEffectiveImage(question, 'question', pending);
  if (!qImg) return false;
  if (question.question_format === 'MCQ' && question.options) {
    const opts = question.options as NexusQBQuestionOption[];
    return opts.every((o) => getEffectiveImage(question, o.id as SlotType, pending));
  }
  return true;
}

function hasSomeImages(question: NexusQBQuestion, pending: PendingImages): boolean {
  if (getEffectiveImage(question, 'question', pending)) return true;
  if (question.options) {
    const opts = question.options as NexusQBQuestionOption[];
    return opts.some((o) => getEffectiveImage(question, o.id as SlotType, pending));
  }
  return false;
}

export default function BulkImageQuestionCard({
  question,
  activeSlot,
  onSlotFocus,
  onPendingChange,
  getToken,
  registerSlotRef,
  pending,
}: BulkImageQuestionCardProps) {
  const theme = useTheme();
  const isMCQ = question.question_format === 'MCQ';
  const allDone = hasAllImages(question, pending);
  const someDone = hasSomeImages(question, pending);

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

  const options = (question.options as NexusQBQuestionOption[] | null) || [];

  // Build slot list for selector chips
  const slots: { slot: SlotType; label: string }[] = [
    { slot: 'question', label: 'Q Image' },
  ];
  if (isMCQ) {
    for (const opt of options) {
      slots.push({ slot: opt.id as SlotType, label: opt.id.toUpperCase() });
    }
  }

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

      {/* Question text preview */}
      {question.question_text && (
        <Typography
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
        >
          {question.question_text}
        </Typography>
      )}

      {/* Slot selector chips — click to select, NO file picker */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
        {slots.map(({ slot, label }) => {
          const isActive = activeSlot === slot;
          const hasImg = !!getEffectiveImage(question, slot, pending);
          return (
            <Chip
              key={slot}
              label={label}
              size="small"
              variant={isActive ? 'filled' : 'outlined'}
              color={isActive ? 'primary' : hasImg ? 'success' : 'default'}
              onClick={(e) => {
                e.stopPropagation();
                onSlotFocus(slot);
              }}
              sx={{
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 26,
                cursor: 'pointer',
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
      {isMCQ && options.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Option Images
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' },
              gap: 1,
            }}
          >
            {options.map((opt) => (
              <SlotWrapper
                key={opt.id}
                questionId={question.id}
                slot={opt.id as SlotType}
                isActive={activeSlot === opt.id}
                registerRef={registerSlotRef}
                label={`Option ${opt.id.toUpperCase()}`}
              >
                <ImageUploadZone
                  image={getEffectiveImage(question, opt.id as SlotType, pending)}
                  onChange={handleChange(opt.id as SlotType)}
                  label={`${opt.id.toUpperCase()}`}
                  height={80}
                  getToken={getToken}
                  enableGlobalPaste={activeSlot === opt.id}
                  subfolder="options"
                />
              </SlotWrapper>
            ))}
          </Box>
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
