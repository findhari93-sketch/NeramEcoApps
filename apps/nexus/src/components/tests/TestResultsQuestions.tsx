'use client';

/**
 * Which questions are not doing their job, and what to do about it.
 *
 * The list has always been able to say "0 of 9 got this right, and all 9 picked
 * Copper Age". What it could not do was anything about it: fixing the question
 * meant leaving the page, finding the paper, and finding the question again. So
 * the one screen that knows a question is broken was the one screen that could
 * not touch it.
 *
 * Selection follows EligibilityRosterPanel: an explicit "Select questions" mode,
 * a checkbox per card, and one sticky action bar rather than a row of buttons
 * repeated on every card. On a phone that is the difference between a readable
 * list and a wall of controls.
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MathText from '@/components/common/MathText';

export interface QuestionAnalysisRow {
  question_id: string;
  question_text: string | null;
  sort_order: number;
  answered: number;
  correct: number;
  correct_pct: number | null;
  top_wrong_option: { key: string; text: string | null; count: number } | null;
  needs_review: boolean;
}

interface Props {
  questions: QuestionAnalysisRow[];
  /** Open the AI review for these questions. */
  onReview: (questionIds: string[]) => void;
  /** Open the plain editor for one question. */
  onEdit: (questionId: string) => void;
}

function pctColor(pct: number | null): 'default' | 'success' | 'warning' | 'error' {
  if (pct == null) return 'default';
  if (pct >= 70) return 'success';
  if (pct >= 40) return 'warning';
  return 'error';
}

export default function TestResultsQuestions({ questions, onReview, onEdit }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; id: string } | null>(null);

  const flagged = useMemo(() => questions.filter((q) => q.needs_review), [questions]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectFlagged() {
    setSelecting(true);
    setSelected(new Set(flagged.map((q) => q.question_id)));
  }

  function clear() {
    setSelecting(false);
    setSelected(new Set());
  }

  if (questions.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No answers recorded yet. Once students start submitting, the questions that are not
          working show up here.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Button
          size="small"
          onClick={() => (selecting ? clear() : setSelecting(true))}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {selecting ? 'Cancel selecting' : 'Select questions'}
        </Button>
        {/* One tap to the group that actually needs a look. needs_review is
            already computed server-side, so this is a filter, not a guess. */}
        {flagged.length > 0 && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<AutoFixHighOutlinedIcon />}
            onClick={selectFlagged}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Select the {flagged.length} that need a look
          </Button>
        )}
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: selecting ? 10 : 0 }}>
        {questions.map((q, i) => {
          const isSelected = selected.has(q.question_id);
          return (
            <Box key={q.question_id}>
              {i > 0 && <Divider />}
              <Box
                onClick={selecting ? () => toggle(q.question_id) : undefined}
                sx={{
                  p: 1.75,
                  bgcolor: isSelected
                    ? 'action.selected'
                    : q.needs_review
                      ? 'warning.light'
                      : 'transparent',
                  cursor: selecting ? 'pointer' : 'default',
                  '&:hover': selecting ? { bgcolor: 'action.hover' } : undefined,
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, mb: 0.75, alignItems: 'flex-start' }}>
                  {selecting && (
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggle(q.question_id)}
                      onClick={(e) => e.stopPropagation()}
                      inputProps={{ 'aria-label': `Select question ${i + 1}` }}
                      sx={{ p: 0.5, mt: -0.5 }}
                    />
                  )}
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 20, mt: 0.25 }}
                  >
                    {i + 1}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Through MathText, matching the Overview tab. This list
                        rendered plain Typography, so any question carrying a
                        formula showed its markup to the teacher. */}
                    <MathText text={q.question_text || 'Question'} variant="body2" />
                  </Box>
                  <Chip
                    size="small"
                    label={q.correct_pct == null ? 'No data' : `${q.correct_pct}%`}
                    color={pctColor(q.correct_pct)}
                    sx={{ height: 24, fontWeight: 700, flexShrink: 0 }}
                  />
                  {!selecting && (
                    <IconButton
                      size="small"
                      aria-label={`Actions for question ${i + 1}`}
                      onClick={(e) => setMenuFor({ el: e.currentTarget, id: q.question_id })}
                      sx={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {q.correct} of {q.answered} got it right
                  {q.top_wrong_option
                    ? ` · most picked "${q.top_wrong_option.text || q.top_wrong_option.key}" (${q.top_wrong_option.count})`
                    : ''}
                </Typography>

                {q.needs_review && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 700 }}>
                    Check this question. At this rate it is more likely unclear than hard.
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Paper>

      <Menu
        open={Boolean(menuFor)}
        anchorEl={menuFor?.el}
        onClose={() => setMenuFor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (menuFor) onReview([menuFor.id]);
            setMenuFor(null);
          }}
          sx={{ minHeight: 48, gap: 1 }}
        >
          <AutoFixHighOutlinedIcon fontSize="small" />
          Check with AI
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) onEdit(menuFor.id);
            setMenuFor(null);
          }}
          sx={{ minHeight: 48, gap: 1 }}
        >
          <EditOutlinedIcon fontSize="small" />
          Edit question
        </MenuItem>
      </Menu>

      {/* The action bar, sticky so a selection made at the top of a fifty
          question paper is still actionable at the bottom of it. */}
      {selecting && selected.size > 0 && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            p: 1.5,
            pb: `calc(12px + env(safe-area-inset-bottom))`,
            bgcolor: 'background.paper',
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            {selected.size} selected
          </Typography>
          <Box sx={{ flex: 1 }} />
          {selected.size === 1 && (
            <Button
              variant="outlined"
              startIcon={<EditOutlinedIcon />}
              onClick={() => onEdit([...selected][0])}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Edit
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AutoFixHighOutlinedIcon />}
            onClick={() => onReview([...selected])}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Check {selected.size} with AI
          </Button>
        </Box>
      )}
    </Box>
  );
}
