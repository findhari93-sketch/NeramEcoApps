'use client';

import { usePathname } from 'next/navigation';
import { Fab, Tooltip } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { BOTTOM_NAV_HEIGHT } from '@/lib/shell-chrome';
import { useAssistantOptional } from './AssistantProvider';

/**
 * The ONE floating button on student pages. It replaced the fixed "Report a
 * problem" button (now a quick action inside the sheet). The sketchbook page
 * keeps its own "Add a sketch" button in this corner, so the launcher steps
 * aside there; the top-bar icon and the dashboard card still open the panel.
 */
export default function AssistantLauncher() {
  const assistant = useAssistantOptional();
  const pathname = usePathname() || '';
  if (!assistant || !assistant.enabled || assistant.open) return null;
  if (pathname.startsWith('/student/sketchbook')) return null;

  return (
    <Tooltip title="Neram Assistant" placement="left">
      <Fab
        color="primary"
        size="medium"
        aria-label="Open Neram Assistant"
        onClick={() => assistant.openPanel()}
        data-no-screenshot="true"
        sx={{
          position: 'fixed',
          right: 16,
          // Above the bottom nav (which lives below md) with room for a page's own
          // scroll-to-top; a plain corner offset once the bottom nav is gone.
          bottom: { xs: BOTTOM_NAV_HEIGHT + 64, md: 32 },
          minWidth: 56,
          minHeight: 56,
          zIndex: (t) => t.zIndex.speedDial,
        }}
      >
        <AutoAwesomeOutlinedIcon />
      </Fab>
    </Tooltip>
  );
}
