'use client';

/**
 * Small client pieces of the public tool pages that need the theme or the UI
 * catalog (icons live in a 'use client' module, so server code cannot read it).
 */
import { Box } from '@neram/ui';
import { TOOL_CATALOG } from '@/lib/navigation-data';
import ToolTile, { trackTint } from '@/components/tools-hub/ToolTile';

export function ToolIconTile({ toolId }: { toolId: string }) {
  const tool = TOOL_CATALOG.find((t) => t.id === toolId);
  if (!tool) return null;
  const { Icon } = tool;
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => {
        const tint = trackTint(theme, tool.track);
        return {
          // Hidden on a phone so the answer gets the full width.
          display: { xs: 'none', sm: 'flex' },
          width: { xs: 44, md: 52 },
          height: { xs: 44, md: 52 },
          flexShrink: 0,
          borderRadius: 3,
          alignItems: 'center',
          justifyContent: 'center',
          color: tint.fg,
          bgcolor: tint.bg,
        };
      }}
    >
      <Icon sx={{ fontSize: { xs: 24, md: 28 } }} />
    </Box>
  );
}

export function RelatedToolTiles({ ids }: { ids: string[] }) {
  const tools = ids.map((id) => TOOL_CATALOG.find((t) => t.id === id)).filter(Boolean) as typeof TOOL_CATALOG;
  return (
    <Box
      component="ul"
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
      }}
    >
      {tools.map((t) => (
        <li key={t.id}>
          <ToolTile tool={t} />
        </li>
      ))}
    </Box>
  );
}
