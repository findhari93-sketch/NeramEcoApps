'use client';

import { Box, Snackbar, Typography, IconButton, alpha } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import {
  neramTokens,
  neramFontFamilies,
  neramShadows,
} from '@neram/ui';
import type { GamificationBadgeRarity } from '@neram/database/types';

// ── Rarity colors ──

const RARITY_COLORS: Record<string, string> = {
  common: '#8B9DAF',
  rare: '#1a8fff',
  epic: '#9B59B6',
  legendary: '#e8a020',
};

const RARITY_BG: Record<string, string> = {
  common: 'rgba(139, 157, 175, 0.12)',
  rare: 'rgba(26, 143, 255, 0.12)',
  epic: 'rgba(155, 89, 182, 0.12)',
  legendary: 'rgba(232, 160, 32, 0.15)',
};

// ── Props ──

interface BadgeEarnedToastProps {
  badge: {
    display_name: string;
    rarity_tier: string;
    icon_svg_path: string;
  } | null;
  open: boolean;
  onClose: () => void;
}

export default function BadgeEarnedToast({
  badge,
  open,
  onClose,
}: BadgeEarnedToastProps) {
  if (!badge) return null;

  const rarityColor = RARITY_COLORS[badge.rarity_tier] || RARITY_COLORS.common;
  const rarityBg = RARITY_BG[badge.rarity_tier] || RARITY_BG.common;
  const isLegendary = badge.rarity_tier === 'legendary';

  return (
    <Snackbar
      open={open}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        '& .MuiSnackbarContent-root': {
          display: 'none', // We use custom content
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          '@keyframes badgeToastSlideUp': {
            from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
            to: { opacity: 1, transform: 'translateY(0) scale(1)' },
          },
          bgcolor: neramTokens.navy[800],
          border: `1px solid ${alpha(rarityColor, 0.3)}`,
          borderRadius: 3,
          px: 2,
          py: 1.5,
          minWidth: 280,
          maxWidth: 380,
          boxShadow: isLegendary
            ? neramShadows.goldGlowSm
            : `0 4px 16px ${alpha(rarityColor, 0.2)}`,
          animation: 'badgeToastSlideUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1)',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
          // Rarity-colored glow background
          background: `
            radial-gradient(ellipse at 20% 50%, ${alpha(rarityColor, 0.08)} 0%, transparent 70%),
            ${neramTokens.navy[800]}
          `,
        }}
      >
        {/* Badge icon */}
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            bgcolor: rarityBg,
            border: `2px solid ${alpha(rarityColor, 0.4)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Box
            component="img"
            src={badge.icon_svg_path}
            alt={badge.display_name}
            sx={{
              width: 28,
              height: 28,
              objectFit: 'contain',
            }}
          />
        </Box>

        {/* Text */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: neramTokens.cream[100],
              lineHeight: 1.3,
            }}
          >
            You earned: {badge.display_name}!
          </Typography>
          <Typography
            sx={{
              fontFamily: neramFontFamilies.mono,
              fontSize: '0.6rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: rarityColor,
              mt: 0.25,
            }}
          >
            {badge.rarity_tier}
          </Typography>
        </Box>

        {/* Close */}
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: alpha(neramTokens.cream[100], 0.4),
            '&:hover': { color: neramTokens.cream[100] },
            flexShrink: 0,
          }}
        >
          <CloseIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </Box>
    </Snackbar>
  );
}
