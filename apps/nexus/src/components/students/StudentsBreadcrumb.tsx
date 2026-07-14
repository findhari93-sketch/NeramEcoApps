'use client';

import { Box, Typography, useTheme, alpha } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface Crumb {
  label: string;
  onClick?: () => void; // omit for the current (last) level
}

/**
 * Location breadcrumb for the City-Wise drill (All > India > Tamil Nadu > Chennai).
 * Ancestor crumbs are tappable to jump back up a level; the last crumb is the
 * current location and is not interactive.
 */
export default function StudentsBreadcrumb({ items }: { items: Crumb[] }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0.25,
        mb: 2,
      }}
    >
      {items.map((crumb, i) => {
        const isLast = i === items.length - 1;
        const clickable = !!crumb.onClick && !isLast;
        return (
          <Box key={`${crumb.label}-${i}`} sx={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled', mx: 0.25 }} />
            )}
            <Typography
              variant="body2"
              onClick={clickable ? crumb.onClick : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        crumb.onClick?.();
                      }
                    }
                  : undefined
              }
              sx={{
                fontWeight: isLast ? 700 : 600,
                color: isLast ? 'text.primary' : 'primary.main',
                cursor: clickable ? 'pointer' : 'default',
                px: clickable ? 0.75 : 0,
                py: clickable ? 0.25 : 0,
                borderRadius: 1.5,
                transition: 'background-color .2s',
                '&:hover': clickable ? { bgcolor: alpha(theme.palette.primary.main, 0.08) } : {},
                '&:focus-visible': clickable
                  ? { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 }
                  : {},
              }}
            >
              {crumb.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
