'use client';

/**
 * The one place an assignment says whether it has questions, and the one door
 * to writing them.
 *
 * This exists because the composer was unreachable. It only appeared on the
 * second screen of the create dialog, behind a button reading "Create and add
 * the paper" (where "paper" reads as a PDF you upload), and in edit mode it sat
 * below the materials block, off the bottom of a phone. The feature worked and
 * nobody could find it.
 *
 * So the empty state is the important state, and its copy is the actual fix:
 * it names multiple choice and numerical out loud, on a card a teacher cannot
 * scroll past, in all three places an assignment is edited.
 *
 * Rendered by the create dialog, the edit dialog and the teacher detail page.
 * One component so those three cannot drift.
 */
import { Box, Stack, Typography, Button, Chip, alpha, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';

export interface QuestionsSummary {
  count: number;
  totalMarks: number;
  /** Marks the machine awards on its own (MCQ and numerical). */
  autoMarks: number;
  /** Marks left for the teacher (working-only questions). */
  manualMarks: number;
}

interface QuestionsSummaryCardProps {
  summary: QuestionsSummary;
  /** Open the full-screen editor. */
  onEdit: () => void;
  /** Locked once students have answered; the sentence explains why. */
  lockedReason?: string | null;
  /** Hide the action while an assignment id does not exist yet. */
  disabled?: boolean;
  /** Say what the assignment does without questions, when that is the choice. */
  uploadOnlyHint?: boolean;
}

export default function QuestionsSummaryCard({
  summary,
  onEdit,
  lockedReason,
  disabled = false,
  uploadOnlyHint = false,
}: QuestionsSummaryCardProps) {
  const theme = useTheme();
  const empty = summary.count === 0;

  return (
    <Box
      sx={{
        p: { xs: 1.75, sm: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: empty ? 'divider' : alpha(theme.palette.primary.main, 0.3),
        bgcolor: empty ? 'background.paper' : alpha(theme.palette.primary.main, 0.04),
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <QuizOutlinedIcon
          sx={{ fontSize: 20, mt: '2px', flexShrink: 0, color: empty ? 'text.secondary' : 'primary.main' }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" variant="body2" sx={{ fontWeight: 700 }}>
            Questions in the app
          </Typography>

          {empty ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.5 }}>
              {/* The sentence that solves the reported problem. */}
              No questions yet. Add multiple choice or numerical questions and they mark themselves
              the moment a student submits.
              {uploadOnlyHint && ' Leave this empty and students just upload their work.'}
            </Typography>
          ) : (
            <>
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ mt: 0.75 }}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
              >
                <Chip
                  size="small"
                  label={`${summary.count} question${summary.count === 1 ? '' : 's'}`}
                  sx={{ height: 24, fontWeight: 700 }}
                />
                <Chip
                  size="small"
                  label={`${summary.totalMarks} marks`}
                  sx={{ height: 24, fontWeight: 700 }}
                />
                {summary.autoMarks > 0 && (
                  <Chip
                    size="small"
                    icon={<BoltOutlinedIcon sx={{ fontSize: 14 }} />}
                    label={`${summary.autoMarks} auto`}
                    sx={{
                      height: 24,
                      fontWeight: 700,
                      bgcolor: alpha(theme.palette.success.main, 0.14),
                      color: 'success.dark',
                      '& .MuiChip-icon': { color: 'success.dark' },
                    }}
                  />
                )}
                {summary.manualMarks > 0 && (
                  <Chip
                    size="small"
                    label={`${summary.manualMarks} you mark`}
                    sx={{
                      height: 24,
                      fontWeight: 700,
                      bgcolor: alpha(theme.palette.warning.main, 0.16),
                      color: 'warning.dark',
                    }}
                  />
                )}
              </Stack>
              {summary.autoMarks > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Students see their result instantly, with the correct answer and your explanation.
                </Typography>
              )}
            </>
          )}

          {lockedReason && (
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="flex-start"
              sx={{
                mt: 1,
                p: 1,
                borderRadius: 1.5,
                bgcolor: alpha('#EF6C00', 0.1),
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: 16, color: '#B54700', mt: '1px' }} />
              <Typography variant="caption" sx={{ color: '#B54700' }}>
                {lockedReason}
              </Typography>
            </Stack>
          )}

          <Button
            variant={empty ? 'outlined' : 'text'}
            size="small"
            startIcon={empty ? <AddIcon /> : <EditOutlinedIcon />}
            onClick={onEdit}
            disabled={disabled}
            sx={{ mt: 1.25, minHeight: 44, textTransform: 'none', fontWeight: 700 }}
          >
            {empty ? 'Add questions' : lockedReason ? 'View questions' : 'Edit questions'}
          </Button>
          {disabled && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Create the assignment first, then you can write its questions.
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
