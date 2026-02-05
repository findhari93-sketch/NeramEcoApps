'use client';

import React from 'react';
import { Box, BoxProps, styled, useTheme } from '@mui/material';
import { m3Motion, m3LightScheme, m3DarkScheme } from '../theme/brand-2025';

// ============================================
// GLASS CARD - Glassmorphism with Material 3
// ============================================

interface GlassCardProps extends BoxProps {
  /** Blur intensity: light (8px), medium (16px), heavy (24px) */
  blur?: 'light' | 'medium' | 'heavy';
  /** Background opacity (0-1, default: 0.7) */
  opacity?: number;
  /** Add subtle border glow */
  glow?: boolean;
  /** Tint color (uses primary by default) */
  tint?: 'primary' | 'secondary' | 'tertiary' | 'neutral';
  /** Enable hover effect */
  hoverable?: boolean;
  /** Make it clickable */
  clickable?: boolean;
}

const blurValues = {
  light: '8px',
  medium: '16px',
  heavy: '24px',
};

const StyledGlassCard = styled(Box)<{
  blur: string;
  opacity: number;
  glow: boolean;
  tint: string;
  hoverable: boolean;
  clickable: boolean;
  isDark: boolean;
}>(({ theme, blur, opacity, glow, tint, hoverable, clickable, isDark }) => {
  // Get tint color based on prop
  const getTintColor = () => {
    const scheme = isDark ? m3DarkScheme : m3LightScheme;
    switch (tint) {
      case 'primary':
        return scheme.primary;
      case 'secondary':
        return scheme.secondary;
      case 'tertiary':
        return scheme.tertiary;
      default:
        return isDark ? '#ffffff' : '#000000';
    }
  };

  const tintColor = getTintColor();

  return {
    // Glass effect
    background: isDark
      ? `rgba(30, 30, 30, ${opacity})`
      : `rgba(255, 255, 255, ${opacity})`,
    backdropFilter: `blur(${blur}) saturate(180%)`,
    WebkitBackdropFilter: `blur(${blur}) saturate(180%)`,

    // Border
    border: isDark
      ? '1px solid rgba(255, 255, 255, 0.1)'
      : '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: theme.shape.borderRadius * 2,

    // Shadow
    boxShadow: glow
      ? `0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px ${tintColor}20, inset 0 0 0 1px rgba(255, 255, 255, 0.1)`
      : '0 8px 32px rgba(0, 0, 0, 0.1)',

    // Padding
    padding: theme.spacing(3),

    // Position for pseudo-elements
    position: 'relative',
    overflow: 'hidden',

    // Subtle gradient overlay
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '1px',
      background: isDark
        ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)'
        : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      pointerEvents: 'none',
    },

    // Hover effects
    ...(hoverable && {
      transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.emphasized}`,
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: glow
          ? `0 16px 48px rgba(0, 0, 0, 0.15), 0 0 0 1px ${tintColor}30`
          : '0 16px 48px rgba(0, 0, 0, 0.15)',
        background: isDark
          ? `rgba(40, 40, 40, ${opacity + 0.1})`
          : `rgba(255, 255, 255, ${opacity + 0.1})`,
      },
    }),

    // Clickable cursor
    ...(clickable && {
      cursor: 'pointer',
      '&:active': {
        transform: 'translateY(-2px)',
      },
    }),
  };
});

/**
 * GlassCard - Glassmorphism Card Component
 *
 * A modern glassmorphic card with backdrop blur, compatible with Material 3.
 * Works in both light and dark modes.
 *
 * @example
 * ```tsx
 * <GlassCard blur="medium" glow hoverable>
 *   <Typography variant="h6">Glass Content</Typography>
 * </GlassCard>
 * ```
 */
export function GlassCard({
  blur = 'medium',
  opacity = 0.7,
  glow = false,
  tint = 'primary',
  hoverable = false,
  clickable = false,
  children,
  ...props
}: GlassCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <StyledGlassCard
      blur={blurValues[blur]}
      opacity={opacity}
      glow={glow}
      tint={tint}
      hoverable={hoverable}
      clickable={clickable}
      isDark={isDark}
      {...props}
    >
      {children}
    </StyledGlassCard>
  );
}

// ============================================
// GLASS OVERLAY - For modals/dialogs
// ============================================

interface GlassOverlayProps extends BoxProps {
  /** Show the overlay */
  open?: boolean;
  /** Click handler for backdrop */
  onClose?: () => void;
}

const StyledGlassOverlay = styled(Box)<{ open: boolean }>(({ open }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: 1300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  opacity: open ? 1 : 0,
  visibility: open ? 'visible' : 'hidden',
  transition: `all ${m3Motion.duration.medium2}ms ${m3Motion.easing.emphasized}`,
}));

/**
 * GlassOverlay - Glassmorphic modal backdrop
 */
export function GlassOverlay({
  open = false,
  onClose,
  children,
  ...props
}: GlassOverlayProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <StyledGlassOverlay open={open} onClick={handleBackdropClick} {...props}>
      {children}
    </StyledGlassOverlay>
  );
}

export default GlassCard;
