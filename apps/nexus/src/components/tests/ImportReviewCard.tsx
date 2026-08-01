'use client';

/**
 * One parsed question in the import review step.
 *
 * Carries the whole decision for that row: what the AI wrote, whether the bank
 * already has it, and what we are going to do about it.
 *
 * The action chooser is a menu rather than a row of toggle buttons because the
 * previous toggles said only "Add as new" with no indication of what that did,
 * and the captions for the other two appeared only once selected, so the
 * choices could never be compared before choosing. Every option now carries its
 * consequence in the menu, and the selected one repeats it underneath.
 */

import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Paper,
  Collapse,
  Button,
  Menu,
  MenuItem,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import ExpandLessOutlinedIcon from '@mui/icons-material/ExpandLessOutlined';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import type { ImportQuestion } from '@/lib/qb-import-schema';

export type RowAction = 'create' | 'reuse' | 'merge' | 'replace' | 'keep_both' | 'skip';

/**
 * What each action does, in the teacher's words. Exported because the review
 * page shows the same wording in its summary and its legend, and two copies of
 * this drift the moment one is edited.
 */
export const ROW_ACTIONS: Record<
  RowAction,
  { label: string; effect: string; duplicateOnly: boolean }
> = {
  create: {
    label: 'Add as new',
    effect: 'Creates a new question in the bank and puts it in this test.',
    duplicateOnly: false,
  },
  reuse: {
    label: 'Keep the bank one',
    effect: 'Nothing is created. This test uses the question already in the bank.',
    duplicateOnly: true,
  },
  merge: {
    label: 'Fill in the gaps',
    effect:
      'Keeps the bank question and adds these tags. Its explanation is filled in only if it is missing.',
    duplicateOnly: true,
  },
  replace: {
    label: 'Replace the bank one',
    effect:
      'Rewrites the bank question with this wording, options, answer and explanation. Every test already using it gets the update.',
    duplicateOnly: true,
  },
  keep_both: {
    label: 'Keep both',
    effect: 'Adds this alongside the existing one, and you pick which of the two this test uses.',
    duplicateOnly: true,
  },
  skip: {
    label: 'Do not include',
    effect: 'Nothing is created and this question is left out of the test.',
    duplicateOnly: false,
  },
};

const ACTION_ORDER: RowAction[] = ['create', 'reuse', 'merge', 'replace', 'keep_both', 'skip'];

export interface DuplicateCandidate {
  id: string;
  question_text: string | null;
  options: Array<{ id: string; text: string }> | null;
  correct_answer: string | null;
  explanation_brief: string | null;
  difficulty: string | null;
  exam_relevance: string | null;
  similarity: number;
  used_in_tests: number;
  verdict: 'likely_duplicate' | 'near_identical' | 'similar';
}

export interface ReviewRow {
  question: ImportQuestion;
  action: RowAction;
  /**
   * What the preview suggested. Kept so that un-skipping a row restores the
   * suggestion instead of silently dropping back to 'create', which is how a
   * skipped duplicate used to come back as a second copy in the bank.
   */
  suggestedAction: RowAction;
  candidates: DuplicateCandidate[];
  /** Which existing bank question the duplicate actions point at. */
  existingId: string | null;
  /** Only read for 'keep_both': which of the two goes into this test. */
  useInTest: 'new' | 'existing';
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
  onUseInTestChange,
  onCompare,
  onEditTags,
}: {
  row: ReviewRow;
  index: number;
  /** tag id or pending slug -> display label. */
  tagLabels: Map<string, string>;
  onActionChange: (action: RowAction) => void;
  onUseInTestChange: (which: 'new' | 'existing') => void;
  onCompare: () => void;
  onEditTags: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { question, candidates, action } = row;

  // The teacher may have switched candidates in the compare dialog, so the
  // question being acted on is the one existingId names, not simply the top hit.
  const existing = candidates.find((c) => c.id === row.existingId) || candidates[0];
  const isDuplicate = Boolean(existing && existing.verdict !== 'similar');
  // Below the duplicate threshold the trigram still found something. It gets a
  // quiet way in rather than a warning, because most of these are not duplicates
  // and the ones that are would otherwise be unreachable.
  const hasNearMiss = Boolean(existing && existing.verdict === 'similar');

  const available = ACTION_ORDER.filter((a) => !ROW_ACTIONS[a].duplicateOnly || isDuplicate);

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

          {isDuplicate && existing && (
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
                {Math.round(existing.similarity * 100)}% match already in the bank
                {existing.used_in_tests > 0
                  ? `, used in ${existing.used_in_tests} test${existing.used_in_tests !== 1 ? 's' : ''}`
                  : ''}
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {existing.question_text}
              </Typography>
              <Button
                size="small"
                onClick={onCompare}
                startIcon={<CompareArrowsOutlinedIcon sx={{ fontSize: 16 }} />}
                sx={{ textTransform: 'none', mt: 0.5, minHeight: 36, color: 'inherit', fontWeight: 700 }}
              >
                Compare the two{candidates.length > 1 ? ` (${candidates.length} matches)` : ''}
              </Button>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              endIcon={<ArrowDropDownIcon />}
              aria-label={`What to do with question ${index + 1}`}
              sx={{ textTransform: 'none', minHeight: 40, px: 1.25 }}
            >
              {ROW_ACTIONS[action].label}
            </Button>

            {hasNearMiss && (
              <Button
                size="small"
                onClick={onCompare}
                startIcon={<CompareArrowsOutlinedIcon sx={{ fontSize: 16 }} />}
                sx={{ textTransform: 'none', minHeight: 40, color: 'text.secondary' }}
              >
                {candidates.length} similar in the bank
              </Button>
            )}
          </Box>

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            slotProps={{ paper: { sx: { maxWidth: 340 } } }}
          >
            {available.map((a) => (
              <MenuItem
                key={a}
                selected={a === action}
                onClick={() => {
                  onActionChange(a);
                  setMenuAnchor(null);
                }}
                sx={{ whiteSpace: 'normal', alignItems: 'flex-start', minHeight: 48, py: 1 }}
              >
                <ListItemText
                  primary={ROW_ACTIONS[a].label}
                  secondary={ROW_ACTIONS[a].effect}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </MenuItem>
            ))}
          </Menu>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {ROW_ACTIONS[action].effect}
          </Typography>

          {action === 'keep_both' && (
            <Box sx={{ mt: 0.75 }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.25 }}>
                Which one goes in this test?
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={row.useInTest}
                onChange={(_, v) => v && onUseInTestChange(v as 'new' | 'existing')}
                aria-label={`Which question to use for row ${index + 1}`}
              >
                <ToggleButton value="new" sx={{ textTransform: 'none', px: 1.25, minHeight: 36 }}>
                  The new one
                </ToggleButton>
                <ToggleButton value="existing" sx={{ textTransform: 'none', px: 1.25, minHeight: 36 }}>
                  The bank one
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
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
      </Box>
    </Paper>
  );
}
