'use client';

import { Box, Typography } from '@neram/ui';
import { neramTokens, neramFontFamilies } from '@neram/ui';
import type { LeaderboardEntry } from '@neram/database/types';
import StreakFlame from './StreakFlame';
import RankChangeIndicator from './RankChangeIndicator';

interface LeaderboardYourRankProps {
  entry: LeaderboardEntry | null;
  totalStudents: number;
}

export default function LeaderboardYourRank({
  entry,
  totalStudents,
}: LeaderboardYourRankProps) {
  if (!entry) return null;

  const isOutsideTopFifteen = entry.rank > 15;
  const topFifteenGap = isOutsideTopFifteen
    ? (() => {
        // We don't have the top 15 score from this prop alone,
        // so show a generic motivational message
        return null;
      })()
    : null;

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        bgcolor: neramTokens.navy[700],
        borderTop: `2px solid ${neramTokens.gold[500]}`,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 2 },
        minHeight: 56,
      }}
    >
      {/* Rank */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 40,
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontFamily: neramFontFamilies.serif,
            fontWeight: 700,
            fontSize: '1.25rem',
            color: neramTokens.gold[500],
            lineHeight: 1,
          }}
        >
          #{entry.rank}
        </Typography>
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            fontSize: '0.6rem',
            color: neramTokens.cream[300],
            lineHeight: 1.2,
          }}
        >
          of {totalStudents}
        </Typography>
      </Box>

      {/* Info section */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            fontWeight: 600,
            fontSize: '0.8rem',
            color: neramTokens.cream[100],
            lineHeight: 1.3,
          }}
        >
          Your Rank
        </Typography>
        {isOutsideTopFifteen && (
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.7rem',
              color: neramTokens.gold[400],
              lineHeight: 1.3,
            }}
          >
            Keep going! Push into the Top 15!
          </Typography>
        )}
        {topFifteenGap}
      </Box>

      {/* Score */}
      <Typography
        sx={{
          fontFamily: neramFontFamilies.mono,
          fontWeight: 700,
          fontSize: '0.9rem',
          color: neramTokens.gold[500],
          flexShrink: 0,
        }}
      >
        {entry.normalized_score.toLocaleString()} pts
      </Typography>

      {/* Streak */}
      {entry.streak_length > 0 && (
        <Box sx={{ flexShrink: 0 }}>
          <StreakFlame days={entry.streak_length} size="small" />
        </Box>
      )}

      {/* Rank change */}
      <Box sx={{ flexShrink: 0 }}>
        <RankChangeIndicator change={entry.rank_change} />
      </Box>
    </Box>
  );
}
