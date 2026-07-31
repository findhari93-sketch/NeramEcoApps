'use client';

/**
 * One parsed question in the import review step.
 *
 * Carries the whole decision for that row: what the AI wrote, whether the bank
 * already has it, and what we are going to do about it. The three-way action
 * toggle is the point of the screen, so it is always visible on a duplicate row
 * rather than hidden behind an expander.
 */

import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Button,
} from '@neram/ui';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import ExpandLessOutlinedIcon from '@mui/icons-material/ExpandLessOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { ImportQuestion } from '@/lib/qb-import-schema';

export type RowAction = 'create' | 'reuse' | 'merge' | 'skip';

export interface DuplicateCandidate {
  id: string;
  question_text: string | null;
  similarity: number;
  used_in_tests: number;
  verdict: 'likely_duplicate' | 'near_identical' | 'similar';
}

export interface ReviewRow {
  question: ImportQuestion;
  action: RowAction;
  candidates: DuplicateCandidate[];
  /** Which existing bank question reuse/merge points at. */
  existingId: string | null;
}

const DIFFICULTY_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'error',
};

export default function ImportReviewCard({
  row,
  index,
  tagLabels,
  onActionChange,
  onRemove,
  onEditTags,
}: {
  row: ReviewRow;
  index: number;
  /** tag id or pending slug -> display label. */
  tagLabels: Map<string, string>;
  onActionChange: (action: RowAction) => void;
  onRemove: () => void;
  onEditTags: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { question, candidates, action } = row;
  const top = candidates[0];
  const isDuplicate = Boolean(top && top.verdict !== 'similar');

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        opacity: action === 'skip' ? 0.55 : 1,
        borderColor: isDuplicate ? 'warning.main' : 'divider',
        transition: 'opacity 150ms ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, minWidth: 22, fontWeight: 600 }}>
          {index + 1}
        </Typography>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
            {question.question_text}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mb: 0.75 }}>
            <Chip
              label={question.difficulty}
              size="small"
              color={DIFFICULTY_COLOR[question.difficulty]}
              variant="outlined"
              sx={{ height: 22, fontSize: '0.68rem' }}
            />
            <Chip label={question.exam_relevance} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.68rem' }} />
            {question.question_format === 'NUMERICAL' && (
              <Chip label="Numerical" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.68rem' }} />
            )}
            {question.tag_slugs.map((slug) => (
              <Chip
                key={slug}
                label={tagLabels.get(slug) || slug.replace(/_/g, ' ')}
                size="small"
                color={question.new_tag_slugs.includes(slug) ? 'secondary' : 'primary'}
                variant={question.new_tag_slugs.includes(slug) ? 'outlined' : 'filled'}
                sx={{ height: 22, fontSize: '0.68rem' }}
              />
            ))}
            {question.tag_slugs.length === 0 && (
              <Chip label="No tags" size="small" variant="outlined" color="warning" sx={{ height: 22, fontSize: '0.68rem' }} />
            )}
            <IconButton
              size="small"
              aria-label={`Edit tags for question ${index + 1}`}
              onClick={onEditTags}
              sx={{ minWidth: 32, minHeight: 32 }}
            >
              <LocalOfferOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          {isDuplicate && top && (
            <Box
              sx={{
                p: 1,
                mb: 0.75,
                borderRadius: 1.5,
                bgcolor: 'warning.light',
                color: 'warning.contrastText',
              }}
            >
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
                {Math.round(top.similarity * 100)}% match already in the bank
                {top.used_in_tests > 0 ? `, used in ${top.used_in_tests} test${top.used_in_tests !== 1 ? 's' : ''}` : ''}
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {top.question_text}
              </Typography>
            </Box>
          )}

          <ToggleButtonGroup
            size="small"
            exclusive
            value={action}
            onChange={(_, v) => v && onActionChange(v as RowAction)}
            aria-label={`What to do with question ${index + 1}`}
            sx={{ flexWrap: 'wrap' }}
          >
            <ToggleButton value="create" sx={{ textTransform: 'none', px: 1.25, minHeight: 36 }}>
              Add as new
            </ToggleButton>
            {isDuplicate && (
              <ToggleButton value="reuse" sx={{ textTransform: 'none', px: 1.25, minHeight: 36 }}>
                <ContentCopyOutlinedIcon sx={{ fontSize: 15, mr: 0.5 }} />
                Reuse existing
              </ToggleButton>
            )}
            {isDuplicate && (
              <ToggleButton value="merge" sx={{ textTransform: 'none', px: 1.25, minHeight: 36 }}>
                <CheckCircleOutlinedIcon sx={{ fontSize: 15, mr: 0.5 }} />
                Merge
              </ToggleButton>
            )}
          </ToggleButtonGroup>

          {action === 'merge' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Keeps the existing question and adds these tags. An explanation is only filled in if it is missing.
            </Typography>
          )}
          {action === 'reuse' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              The test uses the question already in the bank. Nothing new is created.
            </Typography>
          )}

          <Button
            size="small"
            onClick={() => setOpen((o) => !o)}
            endIcon={open ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
            sx={{ textTransform: 'none', mt: 0.5, minHeight: 36 }}
          >
            {open ? 'Hide answer' : 'Show answer'}
          </Button>

          <Collapse in={open} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              {question.options ? (
                question.options.map((o) => {
                  const correct = o.id === question.correct_answer;
                  return (
                    <Box
                      key={o.id}
                      sx={{
                        display: 'flex',
                        gap: 1,
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        bgcolor: correct ? 'success.light' : 'transparent',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                        {o.id}
                      </Typography>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {o.text}
                      </Typography>
                      {correct && <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.dark' }} />}
                    </Box>
                  );
                })
              ) : (
                <Typography variant="body2">
                  Answer: <strong>{question.correct_answer}</strong>
                </Typography>
              )}
              {question.explanation && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {question.explanation}
                </Typography>
              )}
            </Box>
          </Collapse>
        </Box>

        <IconButton
          size="small"
          aria-label={action === 'skip' ? `Put question ${index + 1} back` : `Drop question ${index + 1}`}
          onClick={onRemove}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <DeleteOutlineOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Paper>
  );
}
