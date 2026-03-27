'use client';

import { Box, Typography, Avatar } from '@neram/ui';
import { neramTokens, neramFontFamilies } from '@neram/ui';
import type { LeaderboardEntry } from '@neram/database/types';
import StreakFlame from './StreakFlame';
import RankChangeIndicator from './RankChangeIndicator';

const RARITY_COLORS: Record<string, string> = {
  common: '#8B9DAF',
  rare: '#1a8fff',
  epic: '#9B59B6',
  legendary: neramTokens.gold[500],
};

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  onClick?: () => void;
}

export default function LeaderboardRow({ entry, onClick }: LeaderboardRowProps) {
  return (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 1.5 },
        px: { xs: 2, sm: 2.5 },
        py: 1,
        minHeight: 56,
        bgcolor: neramTokens.navy[800],
        borderRadius: 2,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
        // Rising star: gold left border
        ...(entry.is_rising_star && {
          borderLeft: `3px solid ${neramTokens.gold[500]}`,
        }),
        '&:hover': onClick
          ? {
              bgcolor: neramTokens.navy[700],
            }
          : {},
        '&:focus-visible': onClick
          ? {
              outline: `2px solid ${neramTokens.blue[500]}`,
              outlineOffset: -2,
            }
          : {},
      }}
    >
      {/* Rank number */}
      <Typography
        sx={{
          fontFamily: neramFontFamilies.serif,
          fontWeight: 700,
          fontSize: '1rem',
          color: neramTokens.cream[200],
          minWidth: 28,
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {entry.rank}
      </Typography>

      {/* Avatar */}
      <Avatar
        src={entry.avatar_url || undefined}
        alt={entry.student_name}
        sx={{
          width: 32,
          height: 32,
          fontSize: '0.8rem',
          fontFamily: neramFontFamilies.serif,
          fontWeight: 700,
          bgcolor: neramTokens.navy[600],
          color: neramTokens.cream[100],
          flexShrink: 0,
        }}
      >
        {entry.student_name?.charAt(0)?.toUpperCase() || '?'}
      </Avatar>

      {/* Name + batch */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            fontWeight: 600,
            fontSize: '0.875rem',
            color: neramTokens.cream[100],
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.student_name}
        </Typography>
        {entry.batch_name && (
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.7rem',
              color: neramTokens.cream[300],
              lineHeight: 1.2,
            }}
          >
            {entry.batch_name}
          </Typography>
        )}
      </Box>

      {/* Points */}
      <Typography
        sx={{
          fontFamily: neramFontFamilies.mono,
          fontWeight: 700,
          fontSize: '0.85rem',
          color: neramTokens.gold[500],
          flexShrink: 0,
        }}
      >
        {entry.normalized_score.toLocaleString()}
      </Typography>

      {/* Streak */}
      {entry.streak_length > 0 && (
        <Box sx={{ flexShrink: 0 }}>
          <StreakFlame days={entry.streak_length} size="small" />
        </Box>
      )}

      {/* Top badges (small) */}
      {entry.top_badges && entry.top_badges.length > 0 && (
        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            gap: 0.5,
            flexShrink: 0,
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
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `1px solid ${RARITY_COLORS[badge.rarity_tier] || RARITY_COLORS.common}`,
                bgcolor: neramTokens.navy[700],
              }}
            />
          ))}
        </Box>
      )}

      {/* Rank change */}
      <Box sx={{ flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
        <RankChangeIndicator change={entry.rank_change} />
      </Box>
    </Box>
  );
}
