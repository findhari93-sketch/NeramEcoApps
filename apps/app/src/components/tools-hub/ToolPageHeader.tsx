'use client';

import { Box, Typography } from '@neram/ui';
import type { SvgIconComponent } from '@mui/icons-material';
import { TOOL_CATALOG } from '@/lib/navigation-data';
import { trackTint } from './ToolTile';

interface ToolPageHeaderProps {
  /** Catalog id, e.g. "nata-cutoff-calculator". Supplies the icon, track tint and defaults. */
  toolId: string;
  /** Overrides the catalog title (keep it close to the catalog name) */
  title?: string;
  /** Overrides the catalog description */
  description?: React.ReactNode;
  /** Buttons on the right on laptop, below the text on a phone */
  actions?: React.ReactNode;
  /** Small extras under the description, like a year chip or "Last updated" */
  meta?: React.ReactNode;
  Icon?: SvgIconComponent;
}

/**
 * The one header every tool page uses: icon in the exam's tint, a real h1 and
 * a one-line promise. The shell already renders the Back link and breadcrumb
 * above it, so pages should not add their own.
 */
export default function ToolPageHeader({ toolId, title, description, actions, meta, Icon }: ToolPageHeaderProps) {
  const tool = TOOL_CATALOG.find((t) => t.id === toolId);
  const HeaderIcon = Icon ?? tool?.Icon;
  const track = tool?.track ?? 'nata';

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { md: 'flex-start' },
        gap: { xs: 2, md: 3 },
        mb: { xs: 2.5, md: 3.5 },
      }}
    >
      <Box sx={{ display: 'flex', gap: { xs: 1.5, md: 2 }, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        {HeaderIcon && (
          <Box
            aria-hidden="true"
            sx={(theme) => {
              const tint = trackTint(theme, track);
              return {
                width: { xs: 44, md: 52 },
                height: { xs: 44, md: 52 },
                flexShrink: 0,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: tint.fg,
                bgcolor: tint.bg,
                mt: { xs: 0.25, md: 0 },
              };
            }}
          >
            <HeaderIcon sx={{ fontSize: { xs: 24, md: 28 } }} />
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.875rem' }, mb: 0.5 }}>
            {title ?? tool?.title}
          </Typography>
          {(description ?? tool?.description) && (
            <Typography component="div" sx={{ color: 'text.secondary', fontSize: { xs: '0.9375rem', md: '1rem' }, lineHeight: 1.55, maxWidth: 720 }}>
              {description ?? tool?.description}
            </Typography>
          )}
          {meta && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.25 }}>{meta}</Box>}
        </Box>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexShrink: 0, '& > *': { flex: { xs: '1 1 auto', md: '0 0 auto' } } }}>
          {actions}
        </Box>
      )}
    </Box>
  );
}
