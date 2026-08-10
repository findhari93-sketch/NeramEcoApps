'use client';

import { Box, Checkbox, Chip, Tooltip, Typography } from '@neram/ui';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { NexusQBQuestion } from '@neram/database';
import { QB_QUESTION_STATUS_COLORS, QB_QUESTION_STATUS_LABELS } from '@neram/database';
import MathText from '@/components/common/MathText';

export interface PaperQuestionRowProps {
  question: NexusQBQuestion;
  /** Ticked for a bulk action. */
  selected: boolean;
  /** Currently loaded in the detail pane. */
  active: boolean;
  tagCount: number;
  /**
   * 1-based position in paper order, used only when the question carries no
   * display_order.
   *
   * Not cosmetic. A real drawing paper on staging has all 96 questions with a
   * NULL display_order, and `display_order ?? 0` gave every one of them the
   * same name, "Open question 0". Ninety-six controls sharing one accessible
   * name is unusable with a screen reader and ambiguous for anyone else.
   */
  position?: number;
  onToggleSelect: (shiftKey: boolean) => void;
  onActivate: () => void;
}

/**
 * One question of a paper, on one line, staying one line.
 *
 * Two independent affordances live here and must not be confused: the tick box
 * chooses a question for a bulk action, and the rest of the row opens it in the
 * detail pane. Ticking used to mean both in earlier drafts, which made it
 * impossible to select a run without the pane jumping between them.
 *
 * The stem goes through MathText because half of a JEE paper is LaTeX, and a
 * list that prints `$(3c + 2, 2, 0)$` is not a list a teacher can scan.
 */
export default function PaperQuestionRow({
  question,
  selected,
  active,
  tagCount,
  position,
  onToggleSelect,
  onActivate,
}: PaperQuestionRowProps) {
  const qNum = question.display_order ?? position ?? 0;
  const isDrawing = question.question_format === 'DRAWING_PROMPT';
  const answer = question.correct_answer;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: active ? 'primary.50' : selected ? 'action.selected' : 'transparent',
        borderLeft: '3px solid',
        borderLeftColor: active ? 'primary.main' : 'transparent',
      }}
    >
      <Checkbox
        size="small"
        checked={selected}
        onClick={(e) => onToggleSelect((e as React.MouseEvent).shiftKey)}
        inputProps={{ 'aria-label': `Select question ${qNum}` }}
        sx={{ p: 1 }}
      />

      <Box
        role="button"
        tabIndex={0}
        aria-label={`Open question ${qNum}`}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          minHeight: 44,
          py: 0.5,
        }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 32, flexShrink: 0 }}>
          {qNum}
        </Typography>

        <MathText
          text={question.question_text || '(no text)'}
          variant="caption"
          sx={{
            flex: 1,
            minWidth: 0,
            color: 'text.secondary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        />

        <Box sx={{ flexShrink: 0, width: 64, textAlign: 'center' }}>
          {isDrawing ? (
            <Typography variant="caption" color="text.disabled">
              Self-assessed
            </Typography>
          ) : answer ? (
            <Typography variant="caption" fontWeight={700}>
              {answer.toUpperCase()}
            </Typography>
          ) : (
            <Typography variant="caption" color="warning.main">
              No answer
            </Typography>
          )}
        </Box>

        <Tooltip title={tagCount > 0 ? `${tagCount} tags` : 'No tags'} arrow>
          <Box
            aria-label={tagCount > 0 ? `${tagCount} tags` : 'No tags'}
            sx={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              width: 40,
              color: tagCount > 0 ? 'text.secondary' : 'warning.main',
            }}
          >
            <LocalOfferOutlinedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">{tagCount}</Typography>
          </Box>
        </Tooltip>

        <Chip
          label={QB_QUESTION_STATUS_LABELS[question.status] || question.status}
          size="small"
          sx={{
            flexShrink: 0,
            bgcolor: QB_QUESTION_STATUS_COLORS[question.status] + '20',
            color: QB_QUESTION_STATUS_COLORS[question.status],
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 20,
          }}
        />
      </Box>
    </Box>
  );
}
