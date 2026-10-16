'use client';

import { Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SxProps, Theme } from '@mui/material/styles';
import { tokens } from '@/design-system';

interface Props extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  /** 'outlined' draws its own border; 'bare' sits inside another field (the search bar's city select). */
  variant?: 'outlined' | 'bare';
  height?: number;
  fontSize?: number;
  /** Extra styles on the wrapper (width, flex). */
  sx?: SxProps<Theme>;
  children: React.ReactNode;
}

/**
 * Native select with the browser arrow removed and a chevron inset 12px from
 * the right edge, so the arrow sits inside the control instead of on its border.
 * Keeps the native picker (best on phones) and keyboard behaviour.
 */
export default function HubSelect({ variant = 'outlined', height = 44, fontSize = 14, sx, children, ...selectProps }: Props) {
  const outlined = variant === 'outlined';
  return (
    <Box
      sx={[
        {
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          height,
          border: outlined ? '1px solid' : 0,
          borderColor: tokens.lineStrong,
          borderRadius: 1,
          bgcolor: outlined ? tokens.surface : 'transparent',
          '&:hover': outlined ? { borderColor: tokens.inkMuted } : undefined,
          '&:focus-within': { outline: tokens.focusOutline, outlineOffset: outlined ? 1 : -2 },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <Box
        component="select"
        {...selectProps}
        sx={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          width: '100%',
          height: '100%',
          m: 0,
          pl: outlined ? 1.75 : 1.5,
          pr: 5,
          border: 0,
          borderRadius: 1,
          outline: 'none',
          bgcolor: 'transparent',
          font: 'inherit',
          fontSize,
          fontWeight: 600,
          color: tokens.ink,
          cursor: 'pointer',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </Box>
      <ExpandMoreIcon aria-hidden sx={{ position: 'absolute', right: 12, fontSize: 20, color: tokens.inkMuted, pointerEvents: 'none' }} />
    </Box>
  );
}
