'use client';

import { Box, Typography, Paper, alpha, useTheme } from '@neram/ui';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

type StatVariant = 'gradient' | 'outlined' | 'surface';
type StatSize = 'compact' | 'default' | 'wide';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: StatVariant;
  color?: string;
  trend?: { value: number; label?: string };
  subtitle?: string;
  delay?: number;
  size?: StatSize;
  onClick?: () => void;
}

/**
 * Enterprise-grade stat card with 3 variants and 3 sizes:
 * Variants: gradient | outlined | surface
 * Sizes: compact (tight grids) | default | wide (full-width hero)
 */
export default function StatCard({
  title,
  value,
  icon,
  variant = 'surface',
  color,
  trend,
  subtitle,
  delay = 0,
  size = 'default',
  onClick,
}: StatCardProps) {
  const theme = useTheme();
  const cardColor = color || theme.palette.primary.main;

  const variantStyles = {
    gradient: {
      background: `linear-gradient(135deg, ${cardColor} 0%, ${alpha(cardColor, 0.8)} 100%)`,
      color: '#fff',
      border: 'none',
      iconBg: alpha('#fff', 0.2),
      iconColor: '#fff',
      titleColor: alpha('#fff', 0.85),
      valueColor: '#fff',
      trendUpColor: alpha('#fff', 0.9),
      trendDownColor: alpha('#fff', 0.9),
    },
    outlined: {
      background: theme.palette.background.paper,
      color: theme.palette.text.primary,
      border: `1px solid ${theme.palette.divider}`,
      iconBg: alpha(cardColor, 0.1),
      iconColor: cardColor,
      titleColor: theme.palette.text.secondary,
      valueColor: theme.palette.text.primary,
      trendUpColor: theme.palette.success.main,
      trendDownColor: theme.palette.error.main,
    },
    surface: {
      background: alpha(cardColor, 0.04),
      color: theme.palette.text.primary,
      border: `1px solid ${alpha(cardColor, 0.1)}`,
      iconBg: alpha(cardColor, 0.1),
      iconColor: cardColor,
      titleColor: theme.palette.text.secondary,
      valueColor: theme.palette.text.primary,
      trendUpColor: theme.palette.success.main,
      trendDownColor: theme.palette.error.main,
    },
  };

  const s = variantStyles[variant];

  /* ── Size-specific tokens ── */
  const sizeTokens = {
    compact: {
      padding: { xs: 1.5 },
      iconSize: 30,
      iconRadius: 1.5,
      iconFont: '1rem',
      titleFont: '0.6rem',
      titleTransform: 'uppercase' as const,
      valueFont: { xs: '1.15rem', sm: '1.3rem' },
      direction: 'column' as const,
    },
    default: {
      padding: { xs: 1.75, sm: 2 },
      iconSize: 36,
      iconRadius: 2,
      iconFont: '1.15rem',
      titleFont: '0.65rem',
      titleTransform: 'uppercase' as const,
      valueFont: { xs: '1.4rem', sm: '1.6rem' },
      direction: 'column' as const,
    },
    wide: {
      padding: { xs: 2, sm: 2.5 },
      iconSize: 44,
      iconRadius: 2.5,
      iconFont: '1.4rem',
      titleFont: '0.7rem',
      titleTransform: 'uppercase' as const,
      valueFont: { xs: '1.75rem', sm: '2rem' },
      direction: 'row' as const,
    },
  };

  const t = sizeTokens[size];
  const isWide = size === 'wide';

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: t.padding,
        borderRadius: 2,
        background: s.background,
        border: s.border,
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${delay}ms both`,
        '@keyframes fadeInUp': {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '&:hover': {
          transform: onClick ? 'translateY(-2px)' : 'none',
          boxShadow: onClick
            ? variant === 'gradient'
              ? `0 8px 24px ${alpha(cardColor, 0.3)}`
              : '0 4px 16px rgba(0,0,0,0.06)'
            : 'none',
        },
        '&:active': onClick ? { transform: 'scale(0.98)' } : {},
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isWide ? 2 : 1,
        }}
      >
        {/* Icon — on left for wide, on right for default/compact */}
        {isWide && (
          <Box
            sx={{
              width: t.iconSize,
              height: t.iconSize,
              borderRadius: t.iconRadius,
              bgcolor: s.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              '& .MuiSvgIcon-root': {
                fontSize: t.iconFont,
                color: s.iconColor,
              },
            }}
          >
            {icon}
          </Box>
        )}

        {/* Text content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              color: s.titleColor,
              fontWeight: 600,
              textTransform: t.titleTransform,
              letterSpacing: t.titleTransform === 'uppercase' ? '0.5px' : '0.2px',
              fontSize: t.titleFont,
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="h4"
            sx={{
              color: s.valueColor,
              fontWeight: 800,
              mt: 0.5,
              lineHeight: 1.1,
              fontSize: t.valueFont,
              letterSpacing: '-0.5px',
            }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              sx={{ color: s.titleColor, mt: 0.5, display: 'block', lineHeight: 1.3 }}
            >
              {subtitle}
            </Typography>
          )}
          {trend && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
              {trend.value >= 0 ? (
                <TrendingUpIcon sx={{ fontSize: '0.9rem', color: s.trendUpColor }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: '0.9rem', color: s.trendDownColor }} />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: trend.value >= 0 ? s.trendUpColor : s.trendDownColor,
                  fontSize: '0.7rem',
                }}
              >
                {trend.value >= 0 ? '+' : ''}{trend.value}%
                {trend.label && <Box component="span" sx={{ color: s.titleColor, fontWeight: 400, ml: 0.5 }}>{trend.label}</Box>}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Icon — on right for default/compact */}
        {!isWide && (
          <Box
            sx={{
              width: t.iconSize,
              height: t.iconSize,
              borderRadius: t.iconRadius,
              bgcolor: s.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              '& .MuiSvgIcon-root': {
                fontSize: t.iconFont,
                color: s.iconColor,
              },
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
