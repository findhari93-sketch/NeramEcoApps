'use client';

/**
 * "3 questions reported by students", at the top of the question bank.
 *
 * Reads the Question Bank badge the sidebar already polls, so it costs no
 * request of its own, and it disappears the moment the last report is closed.
 * Before this, the only way to the Reports page was a card at the bottom of
 * this page, and three reports on production sat unseen for six months.
 */
import { Box, Button, Typography, alpha, useTheme } from '@neram/ui';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import { useNavBadges } from '@/components/NavBadgeProvider';

export default function ReportedQuestionsBanner() {
  const theme = useTheme();
  const { getBadgeCount } = useNavBadges();
  const count = getBadgeCount('/teacher/question-bank');
  if (count <= 0) return null;

  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        px: 1.5,
        py: 1,
        mb: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(theme.palette.error.main, 0.35),
        bgcolor: alpha(theme.palette.error.main, 0.05),
      }}
    >
      <OutlinedFlagIcon aria-hidden sx={{ color: 'error.main', fontSize: 20 }} />
      <Typography variant="body2" fontWeight={600} sx={{ flex: '1 1 180px', minWidth: 0 }}>
        {count} question{count === 1 ? '' : 's'} reported by students
      </Typography>
      <Button
        href="/teacher/question-bank/reports"
        variant="outlined"
        size="small"
        sx={{ minHeight: 44, textTransform: 'none', flexShrink: 0 }}
      >
        Review
      </Button>
    </Box>
  );
}
