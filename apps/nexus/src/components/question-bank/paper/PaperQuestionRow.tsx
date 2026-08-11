'use client';

import { Box, Checkbox, Tooltip, Typography } from '@neram/ui';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LinkIcon from '@mui/icons-material/Link';
import type { NexusQBQuestion } from '@neram/database';
import { QB_QUESTION_STATUS_COLORS, QB_QUESTION_STATUS_LABELS } from '@neram/database';
import { questionImageSlots } from '@/lib/qb-image-needs';
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
  /** Does this question share a choice_group_id with another on the paper? */
  linked?: boolean;
  onToggleSelect: (shiftKey: boolean, ctrlKey: boolean) => void;
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
  linked,
  onToggleSelect,
  onActivate,
}: PaperQuestionRowProps) {
  const qNum = question.display_order ?? position ?? 0;
  const isDrawing = question.question_format === 'DRAWING_PROMPT';
  const answer = question.correct_answer;
  const statusColor = QB_QUESTION_STATUS_COLORS[question.status] || '#9e9e9e';
  const statusLabel = QB_QUESTION_STATUS_LABELS[question.status] || question.status;

  const imageSlots = questionImageSlots(question);
  const wantedSlots = imageSlots.filter((s) => s.expected);
  const imageState: 'none' | 'complete' | 'missing' =
    wantedSlots.length === 0 ? 'none' : wantedSlots.every((s) => s.filled) ? 'complete' : 'missing';

  const handleRowClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect(e.shiftKey, e.ctrlKey || e.metaKey);
      return;
    }
    onActivate();
  };

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
        onClick={(e) => {
          const me = e as unknown as React.MouseEvent;
          onToggleSelect(me.shiftKey, me.ctrlKey || me.metaKey);
        }}
        inputProps={{ 'aria-label': `Select question ${qNum}` }}
        sx={{ p: 1 }}
      />

      <Box
        role="button"
        tabIndex={0}
        aria-label={`Open question ${qNum}`}
        onClick={handleRowClick}
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
          // shift-click selects a run of text by default in every browser;
          // this row's shift-click means something else.
          userSelect: 'none',
        }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 28, flexShrink: 0 }}>
          {qNum}
        </Typography>

        {linked && (
          <Tooltip title="Attempt any one of a linked group" arrow>
            <LinkIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
          </Tooltip>
        )}

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

        <Box sx={{ flexShrink: 0, width: 28, textAlign: 'center' }}>
          {isDrawing ? (
            <Tooltip title="Self-assessed" arrow>
              <BrushOutlinedIcon aria-label="Self-assessed" sx={{ fontSize: 14, color: 'text.disabled' }} />
            </Tooltip>
          ) : answer ? (
            <Typography variant="caption" fontWeight={700}>
              {answer.toUpperCase()}
            </Typography>
          ) : (
            <Tooltip title="No answer key yet" arrow>
              <Typography variant="caption" color="warning.main" aria-label="No answer key yet">
                &mdash;
              </Typography>
            </Tooltip>
          )}
        </Box>

        {imageState !== 'none' && (
          <Tooltip
            title={imageState === 'complete' ? 'Every expected image is uploaded' : 'Missing an expected image'}
            arrow
          >
            <Box sx={{ flexShrink: 0, width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {imageState === 'complete' ? (
                <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
              ) : (
                <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
              )}
            </Box>
          </Tooltip>
        )}

        <Tooltip title={tagCount > 0 ? `${tagCount} tags` : 'No tags'} arrow>
          <Box
            aria-label={tagCount > 0 ? `${tagCount} tags` : 'No tags'}
            sx={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              width: 32,
              color: tagCount > 0 ? 'text.secondary' : 'text.disabled',
            }}
          >
            <LocalOfferOutlinedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">{tagCount}</Typography>
          </Box>
        </Tooltip>

        <Tooltip title={statusLabel} arrow>
          <Box
            aria-label={statusLabel}
            sx={{
              flexShrink: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: statusColor,
            }}
          />
        </Tooltip>
      </Box>
    </Box>
  );
}
