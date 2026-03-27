'use client';

import { Box, Card, Typography, Avatar } from '@neram/ui';
import { neramTokens, neramFontFamilies, neramShadows } from '@neram/ui';
import type { LeaderboardEntry } from '@neram/database/types';
import StreakFlame from './StreakFlame';

const RANK_COLORS: Record<number, { border: string; glow: string; label: string }> = {
  1: {
    border: neramTokens.gold[500],
    glow: neramShadows.goldGlowSm,
    label: '1st',
  },
  2: {
    border: '#C0C0C0',
    glow: '0 4px 16px rgba(192, 192, 192, 0.2)',
    label: '2nd',
  },
  3: {
    border: '#CD7F32',
    glow: '0 4px 16px rgba(205, 127, 50, 0.2)',
    label: '3rd',
  },
};

const RARITY_COLORS: Record<string, string> = {
  common: '#8B9DAF',
  rare: '#1a8fff',
  epic: '#9B59B6',
  legendary: neramTokens.gold[500],
};

interface LeaderboardTopThreeProps {
  entries: LeaderboardEntry[];
}

export default function LeaderboardTopThree({ entries }: LeaderboardTopThreeProps) {
  const topThree = entries.filter((e) => e.rank >= 1 && e.rank <= 3);

  if (topThree.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        px: { xs: 2, sm: 0 },
        mb: 3,
        justifyContent: 'center',
        alignItems: { xs: 'stretch', sm: 'flex-end' },
      }}
    >
      {topThree.map((entry) => {
        const rank = RANK_COLORS[entry.rank] || RANK_COLORS[3];
        const isFirst = entry.rank === 1;

        return (
          <Card
            key={entry.student_id}
            elevation={0}
            sx={{
              flex: { xs: '1 1 auto', sm: '1 1 0' },
              maxWidth: { sm: 220 },
              p: 2.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              bgcolor: neramTokens.navy[800],
              border: `2px solid ${rank.border}`,
              borderRadius: 3,
              boxShadow: isFirst ? rank.glow : 'none',
              position: 'relative',
              overflow: 'visible',
              // First place is taller on tablet+
              ...(isFirst && {
                order: { xs: 0, sm: -1 },
                mt: { sm: 0 },
                pb: 3,
              }),
              ...(!isFirst && {
                mt: { sm: 2 },
              }),
            }}
          >
            {/* Rank badge */}
            <Box
              sx={{
                position: 'absolute',
                top: -12,
                left: '50%',
                transform: 'translateX(-50%)',
                bgcolor: rank.border,
                color: entry.rank === 2 ? '#333' : '#fff',
                borderRadius: '12px',
                px: 1.5,
                py: 0.25,
                minWidth: 32,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.serif,
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  lineHeight: 1.4,
                }}
              >
                {rank.label}
              </Typography>
            </Box>

            {/* Avatar */}
            <Avatar
              src={entry.avatar_url || undefined}
              alt={entry.student_name}
              sx={{
                width: 56,
                height: 56,
                border: `3px solid ${rank.border}`,
                fontSize: '1.25rem',
                fontFamily: neramFontFamilies.serif,
                fontWeight: 700,
                bgcolor: neramTokens.navy[600],
                color: neramTokens.cream[100],
              }}
            >
              {entry.student_name?.charAt(0)?.toUpperCase() || '?'}
            </Avatar>

            {/* Name */}
            <Typography
              sx={{
                fontFamily: neramFontFamilies.serif,
                fontWeight: 700,
                fontSize: isFirst ? '1.1rem' : '1rem',
                color: neramTokens.cream[100],
                textAlign: 'center',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {entry.student_name}
            </Typography>

            {/* Batch */}
            {entry.batch_name && (
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.body,
                  fontSize: '0.75rem',
                  color: neramTokens.cream[300],
                  textAlign: 'center',
                }}
              >
                {entry.batch_name}
              </Typography>
            )}

            {/* Points */}
            <Typography
              sx={{
                fontFamily: neramFontFamilies.mono,
                fontWeight: 700,
                fontSize: isFirst ? '1.25rem' : '1.1rem',
                color: rank.border,
                lineHeight: 1,
              }}
            >
              {entry.normalized_score.toLocaleString()} pts
            </Typography>

            {/* Streak */}
            {entry.streak_length > 0 && (
              <StreakFlame days={entry.streak_length} size="small" />
            )}

            {/* Top badges */}
            {entry.top_badges && entry.top_badges.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.5,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  mt: 0.5,
                }}
              >
                {entry.top_badges.slice(0, 3).map((badge) => (
                  <Box
                    key={badge.id}
                    component="img"
                    src={badge.icon_svg_path}
                    alt={badge.display_name}
                    title={badge.display_name}
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: `1.5px solid ${RARITY_COLORS[badge.rarity_tier] || RARITY_COLORS.common}`,
                      bgcolor: neramTokens.navy[700],
                      p: 0.25,
                    }}
                  />
                ))}
              </Box>
            )}
          </Card>
        );
      })}
    </Box>
  );
}
