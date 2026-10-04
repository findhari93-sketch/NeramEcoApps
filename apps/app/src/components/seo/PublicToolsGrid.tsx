'use client';

import { Box, Typography } from '@neram/ui';
import { TOOL_CATALOG, TOOL_STAGES, type ToolDef } from '@/lib/navigation-data';
import ToolTile from '@/components/tools-hub/ToolTile';

/** Available tools first, coming-soon tools last, catalog order otherwise. */
function availableFirst(a: ToolDef, b: ToolDef): number {
  return Number(!!a.comingSoon) - Number(!!b.comingSoon);
}

/**
 * The full tool list for the public /tools page, grouped by the stage of the
 * admission journey. Lives in a client module because the catalog does (it
 * carries icon components); it still renders on the server for crawlers.
 */
export default function PublicToolsGrid() {
  const availableCount = TOOL_CATALOG.filter((t) => !t.comingSoon).length;

  return (
    <Box>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mb: { xs: 2.5, md: 3 } }}>
        {availableCount} tools are live today. Try each one free here; sign in to use the full tool and save your results.
      </Typography>
      {TOOL_STAGES.map((stage) => {
        const tools = TOOL_CATALOG.filter((t) => t.stage === stage.id).sort(availableFirst);
        if (tools.length === 0) return null;
        const headingId = `public-stage-${stage.id}`;
        return (
          <Box key={stage.id} component="section" aria-labelledby={headingId} sx={{ mb: { xs: 4, md: 5 } }}>
            <Box sx={{ mb: 1.75 }}>
              <Typography id={headingId} component="h2" sx={{ fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 700 }}>
                {stage.title}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.25 }}>{stage.description}</Typography>
            </Box>
            <Box
              component="ul"
              sx={{
                listStyle: 'none',
                m: 0,
                p: 0,
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
              }}
            >
              {tools.map((tool) => (
                <li key={tool.id}>
                  <ToolTile tool={tool} />
                </li>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
