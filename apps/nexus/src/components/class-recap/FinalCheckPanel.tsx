'use client';

/**
 * The final check, at the end of the class recap it belongs to.
 *
 * It used to be step 4 of the catch-up checklist and a separate page, which is
 * what a student objected to: every question comes from the recording, so a
 * paper standing on its own beside the recording reads as a second chore rather
 * than the end of the class. It now sits directly under the player, inside the
 * Class Recap step, and the checklist has one fewer numbered item.
 *
 * The other half of the same report was that a student who had sat the test came
 * back to a screen identical to the one before he sat it. So the failed state
 * here leads with the score and the date and says what the bar was, and every
 * state offers something to do next. An amber panel that only says "not yet" is
 * the bug, not the fix.
 *
 * Everything rendered is decided by the server, in the same GET the "Mark as
 * caught up" button disables from. Nothing here re-derives whether the paper is
 * open or passed: that is the mistake this feature has already shipped twice.
 */
import { Box, Button, Stack, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import { RADIUS } from '@/components/timetable/timetable-theme';

export interface FinalCheckTest {
  passing_pct: number;
  unlocked: boolean;
  passed: boolean;
  attempts: number;
  last_score_pct: number | null;
  last_attempt_at: string | null;
  best_score_pct: number | null;
  question_count: number | null;
  must_get_right: number | null;
}

interface Props {
  test: FinalCheckTest;
  /** Opens the paper. The answering itself stays on its own focused screen. */
  onStart: () => void;
  /** Sends the player back to the top of the class. */
  onRewatch?: () => void;
}

/** "23 Aug", in IST, matching how the server words the same sentence. */
function attemptDay(iso: string | null): string {
  if (!iso) return 'your last attempt';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return 'your last attempt';
  }
}

export default function FinalCheckPanel({ test, onStart, onRewatch }: Props) {
  const theme = useTheme();

  // One sentence describing the paper, used in both the untried and the retry
  // states so the bar never changes shape between them.
  const shape =
    test.question_count && test.must_get_right
      ? `${test.question_count} questions, ${test.must_get_right} right to pass.`
      : `${test.passing_pct}% to pass.`;

  const tone = test.passed
    ? theme.palette.success.main
    : test.attempts > 0
      ? theme.palette.warning.main
      : theme.palette.primary.main;

  const shell = {
    mt: 2,
    p: 2,
    borderRadius: RADIUS.card,
    border: `1px solid ${alpha(tone, test.unlocked || test.passed ? 0.4 : 0.2)}`,
    bgcolor: alpha(tone, 0.06),
  } as const;

  const heading = (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
      {test.passed ? (
        <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
      ) : test.unlocked ? (
        <FactCheckOutlinedIcon sx={{ fontSize: 20, color: tone }} />
      ) : (
        <LockOutlinedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
      )}
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>Final check</Typography>
    </Stack>
  );

  if (test.passed) {
    return (
      <Box sx={shell}>
        {heading}
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
          {test.best_score_pct != null
            ? `Passed with ${test.best_score_pct}%. This class is done.`
            : 'Passed. This class is done.'}
        </Typography>
      </Box>
    );
  }

  // Still working through the checkpoints. Said as what happens next rather than
  // as a refusal, because the student is already doing the thing that opens it.
  if (!test.unlocked) {
    return (
      <Box sx={{ ...shell, bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
        {heading}
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
          Pass every checkpoint above and the final check opens here. {shape}
        </Typography>
      </Box>
    );
  }

  const retrying = test.attempts > 0;

  return (
    <Box sx={shell}>
      {heading}

      {retrying && test.last_score_pct != null ? (
        <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.6, mb: 1.5 }}>
          You scored <strong>{test.last_score_pct}%</strong> on {attemptDay(test.last_attempt_at)}.
          You need {test.passing_pct}% to clear this class.
          <Typography
            component="span"
            variant="body2"
            sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}
          >
            Your next go asks a different set of questions from the same class.
          </Typography>
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 1.5 }}>
          A short check on the class you just watched. {shape}
        </Typography>
      )}

      {/* Column on a phone so neither button is squeezed under 44px, row once
          there is width for it. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button
          variant="contained"
          onClick={onStart}
          sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700, borderRadius: RADIUS.control }}
        >
          {retrying ? 'Try again' : 'Start the final check'}
        </Button>
        {retrying && onRewatch && (
          <Button
            variant="outlined"
            onClick={onRewatch}
            startIcon={<ReplayIcon />}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            Watch the class again
          </Button>
        )}
      </Stack>

      {retrying && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
          {test.attempts === 1 ? 'One attempt so far.' : `${test.attempts} attempts so far.`}
        </Typography>
      )}
    </Box>
  );
}
