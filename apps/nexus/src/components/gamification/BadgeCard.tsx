'use client';

import { Box, Tooltip, Typography, alpha } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { BadgeCatalogEntry, GamificationBadgeRarity } from '@neram/database/types';
import {
  neramTokens,
  neramFontFamilies,
  neramShadows,
} from '@neram/ui';

// ── Rarity color map ──

const RARITY_COLORS: Record<GamificationBadgeRarity, string> = {
  common: '#8B9DAF',
  rare: '#1a8fff',
  epic: '#9B59B6',
  legendary: neramTokens.gold[500],
};

const LEGENDARY_GRADIENT = 'linear-gradient(135deg, #e8a020, #f5c842)';

// ── Props ──

interface BadgeCardProps {
  badge: BadgeCatalogEntry;
  size?: 'small' | 'medium';
  onClick?: () => void;
}

export default function BadgeCard({
  badge,
  size = 'medium',
  onClick,
}: BadgeCardProps) {
  const isEarned = badge.earned;
  const rarity = badge.rarity_tier;
  const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  const isLegendary = rarity === 'legendary';

  const iconSize = size === 'small' ? 48 : 72;
  const borderWidth = size === 'small' ? 2 : 3;

  const tooltipTitle = isEarned
    ? `${badge.display_name} — ${badge.criteria_description}`
    : `${badge.display_name} (Locked) — ${badge.criteria_description}`;

  return (
    <Tooltip title={tooltipTitle} arrow enterTouchDelay={300} leaveTouchDelay={1500}>
      <Box
        onClick={onClick}
        sx={{
          '@keyframes badgeShimmer': {
            '0%': { backgroundPosition: '-200% center' },
            '100%': { backgroundPosition: '200% center' },
          },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: size === 'small' ? 0.5 : 1,
          cursor: onClick ? 'pointer' : 'default',
          transition: 'transform 150ms ease',
          '&:hover': onClick
            ? { transform: 'scale(1.05)' }
            : undefined,
          '&:active': onClick
            ? { transform: 'scale(0.97)' }
            : undefined,
        }}
      >
        {/* Badge icon circle */}
        <Box
          sx={{
            position: 'relative',
            width: iconSize,
            height: iconSize,
            borderRadius: '50%',
            border: `${borderWidth}px solid ${isEarned ? rarityColor : alpha('#8B9DAF', 0.3)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            opacity: isEarned ? 1 : 0.4,
            filter: isEarned ? 'none' : 'grayscale(100%)',
            boxShadow: isEarned
              ? isLegendary
                ? neramShadows.goldGlowSm
                : `0 2px 8px ${alpha(rarityColor, 0.3)}`
              : 'none',
            bgcolor: isEarned
              ? alpha(rarityColor, 0.08)
              : alpha('#8B9DAF', 0.05),
            // Legendary shimmer overlay
            ...(isEarned && isLegendary
              ? {
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: `linear-gradient(90deg, transparent 0%, ${alpha('#f5c842', 0.25)} 50%, transparent 100%)`,
                    backgroundSize: '200% 100%',
                    animation: 'badgeShimmer 3s ease-in-out infinite',
                    pointerEvents: 'none',
                    '@media (prefers-reduced-motion: reduce)': {
                      animation: 'none',
                    },
                  },
                }
              : {}),
          }}
        >
          {isEarned ? (
            <Box
              component="img"
              src={badge.icon_svg_path}
              alt={badge.display_name}
              sx={{
                width: iconSize * 0.6,
                height: iconSize * 0.6,
                objectFit: 'contain',
              }}
            />
          ) : (
            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box
                component="img"
                src={badge.icon_locked_svg_path || badge.icon_svg_path}
                alt={`${badge.display_name} (locked)`}
                sx={{
                  width: iconSize * 0.5,
                  height: iconSize * 0.5,
                  objectFit: 'contain',
                  filter: 'grayscale(100%) brightness(0.6)',
                }}
              />
              <LockOutlinedIcon
                sx={{
                  position: 'absolute',
                  bottom: -2,
                  right: -4,
                  fontSize: size === 'small' ? 12 : 16,
                  color: alpha('#8B9DAF', 0.6),
                }}
              />
            </Box>
          )}
        </Box>

        {/* Rarity dot + name (medium only) */}
        {size === 'medium' && (
          <Box sx={{ textAlign: 'center', maxWidth: iconSize + 16 }}>
            <Typography
              sx={{
                fontSize: '0.65rem',
                fontFamily: neramFontFamilies.body,
                fontWeight: isEarned ? 600 : 400,
                color: isEarned
                  ? neramTokens.cream[100]
                  : alpha(neramTokens.cream[100], 0.4),
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {badge.display_name}
            </Typography>

            {/* Rarity label */}
            {isEarned && (
              <Typography
                sx={{
                  fontSize: '0.55rem',
                  fontFamily: neramFontFamilies.mono,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  mt: 0.25,
                  ...(isLegendary
                    ? {
                        background: LEGENDARY_GRADIENT,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }
                    : {
                        color: rarityColor,
                      }),
                }}
              >
                {rarity}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}
