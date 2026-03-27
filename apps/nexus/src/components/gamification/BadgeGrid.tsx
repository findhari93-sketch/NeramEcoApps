'use client';

import { Box, Typography, alpha } from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import type { BadgeCatalogEntry } from '@neram/database/types';
import {
  neramTokens,
  neramFontFamilies,
} from '@neram/ui';
import BadgeCard from './BadgeCard';

interface BadgeGridProps {
  badges: BadgeCatalogEntry[];
  onBadgeClick?: (badge: BadgeCatalogEntry) => void;
}

export default function BadgeGrid({ badges, onBadgeClick }: BadgeGridProps) {
  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);

  // Earned first, then locked
  const sortedBadges = [...earnedBadges, ...lockedBadges];
  const earnedCount = earnedBadges.length;
  const totalCount = badges.length;

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EmojiEventsOutlinedIcon
            sx={{ fontSize: '1.1rem', color: neramTokens.gold[500] }}
          />
          <Typography
            sx={{
              fontFamily: neramFontFamilies.serif,
              fontSize: '1rem',
              fontWeight: 600,
              color: neramTokens.cream[100],
            }}
          >
            Badges
          </Typography>
        </Box>

        <Typography
          sx={{
            fontFamily: neramFontFamilies.mono,
            fontSize: '0.75rem',
            color: alpha(neramTokens.cream[100], 0.6),
          }}
        >
          {earnedCount} of {totalCount} earned
        </Typography>
      </Box>

      {/* Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(4, 1fr)',
            sm: 'repeat(6, 1fr)',
          },
          gap: { xs: 1.5, sm: 2 },
        }}
      >
        {sortedBadges.map((badge) => (
          <BadgeCard
            key={badge.id}
            badge={badge}
            size="medium"
            onClick={onBadgeClick ? () => onBadgeClick(badge) : undefined}
          />
        ))}
      </Box>

      {totalCount === 0 && (
        <Typography
          sx={{
            textAlign: 'center',
            fontFamily: neramFontFamilies.body,
            fontSize: '0.85rem',
            color: alpha(neramTokens.cream[100], 0.4),
            py: 4,
          }}
        >
          No badges available yet
        </Typography>
      )}
    </Box>
  );
}
