'use client';

import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import { alpha, type Theme } from '@mui/material/styles';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { trackLabel, type ToolDef, type ToolTrack } from '@/lib/navigation-data';

/** Each exam track gets its own tint so a long list scans by colour as well as by label. */
export function trackTint(theme: Theme, track: ToolTrack): { fg: string; bg: string } {
  const light = theme.palette.mode === 'light';
  switch (track) {
    case 'jee':
      return { fg: light ? '#9c5f08' : '#f4bf5a', bg: alpha('#e8a020', light ? 0.14 : 0.16) };
    case 'counseling':
      return { fg: light ? '#00695C' : '#4DB6AC', bg: alpha('#00897B', light ? 0.1 : 0.18) };
    default:
      return { fg: theme.palette.primary.main, bg: alpha(theme.palette.primary.main, light ? 0.1 : 0.16) };
  }
}

interface ToolTileProps {
  tool: ToolDef;
  /** Hide the exam label when the list is already filtered to one exam */
  showTrack?: boolean;
}

export default function ToolTile({ tool, showTrack = true }: ToolTileProps) {
  const { Icon, comingSoon } = tool;

  const body = (
    <>
      <Box
        aria-hidden="true"
        sx={(theme) => {
          const tint = trackTint(theme, tool.track);
          return {
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tint.fg,
            bgcolor: tint.bg,
          };
        }}
      >
        <Icon sx={{ fontSize: 24 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25, mb: 0.25 }}>
          <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}>
            {tool.title}
          </Typography>
          {comingSoon && (
            <Box
              component="span"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                bgcolor: 'action.hover',
                color: 'text.secondary',
              }}
            >
              Coming soon
            </Box>
          )}
        </Box>
        <Typography
          sx={{
            fontSize: '0.875rem',
            lineHeight: 1.5,
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {tool.description}
        </Typography>
        {showTrack && (
          <Typography
            component="span"
            sx={(theme) => ({
              display: 'inline-block',
              mt: 0.75,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: trackTint(theme, tool.track).fg,
            })}
          >
            {trackLabel(tool.track)}
          </Typography>
        )}
      </Box>
      {!comingSoon && (
        <ChevronRightRoundedIcon
          className="tile-chevron"
          aria-hidden="true"
          sx={{ color: 'text.secondary', alignSelf: 'center', flexShrink: 0, transition: 'transform 0.2s ease' }}
        />
      )}
    </>
  );

  const tileSx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.75,
    height: '100%',
    p: 2,
    borderRadius: 3.5,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    textDecoration: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
  };

  if (comingSoon) {
    return (
      <Box sx={{ ...tileSx, opacity: 0.72, bgcolor: 'transparent', borderStyle: 'dashed' }} aria-disabled="true">
        {body}
      </Box>
    );
  }

  return (
    <Box
      component={Link}
      href={tool.href}
      sx={{
        ...tileSx,
        cursor: 'pointer',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: (theme: Theme) => `0 6px 20px ${alpha(theme.palette.primary.main, 0.12)}`,
          '& .tile-chevron': { transform: 'translateX(3px)', color: 'primary.main' },
        },
        '&:active': { bgcolor: 'action.hover' },
      }}
    >
      {body}
    </Box>
  );
}
