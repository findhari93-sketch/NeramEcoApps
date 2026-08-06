'use client';

/**
 * Where this bank question came from.
 *
 * The bank is one shared repository, which is the point of it and also the
 * thing that makes a stray question hard to place: 3,297 rows and no way to ask
 * "which upload produced this one, and can I get that file back to fix it".
 * Everything shown here has been archived since nexus_test_imports shipped and
 * has never been on a screen.
 *
 * Renders nothing at all when there is no import behind the question. Hand
 * authored questions and everything older than the archive are in that
 * position, and a panel reading "unknown" on half the bank is worse than no
 * panel.
 */

import { Box, Typography, Button, Chip } from '@neram/ui';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { describeTestOrigin, type TestOriginFacts } from '@/lib/test-origin';

export interface QuestionOrigin extends TestOriginFacts {
  test_id: string;
  test_title: string;
  used_in_tests: number;
}

export default function QuestionOriginNote({ origin }: { origin: QuestionOrigin | null | undefined }) {
  if (!origin) return null;

  const described = describeTestOrigin(origin);

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: described.hasLoss ? 'warning.main' : 'divider',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
      }}
    >
      <HistoryOutlinedIcon
        sx={{
          fontSize: 18,
          mt: '2px',
          flexShrink: 0,
          color: described.hasLoss ? 'warning.main' : 'text.secondary',
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {described.headline}
        </Typography>
        {described.details.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {described.details.join(' ')}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.75 }}>
          {/* Reuse is the whole reason the bank exists, so it is stated rather
              than left for a teacher to discover by editing and surprising
              someone else's paper. */}
          {origin.used_in_tests > 1 && (
            <Chip
              size="small"
              variant="outlined"
              color="info"
              label={`Used in ${origin.used_in_tests} tests`}
            />
          )}
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewRoundedIcon />}
            href={`/teacher/tests/${origin.test_id}`}
            target="_blank"
            rel="noopener"
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            {origin.test_title}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
