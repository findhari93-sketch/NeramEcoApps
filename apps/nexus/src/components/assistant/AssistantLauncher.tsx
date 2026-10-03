'use client';

import { usePathname } from 'next/navigation';
import { Fab, Tooltip, Zoom, useMediaQuery, useTheme } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { BOTTOM_NAV_HEIGHT } from '@/lib/shell-chrome';
import { useAssistantOptional } from './AssistantProvider';
import { focusRing } from './focusRing';

/**
 * The ONE floating button on student pages. It replaced the fixed "Report a
 * problem" button (now a quick action inside the sheet). The sketchbook page
 * keeps its own "Add a sketch" button in this corner, so the launcher steps
 * aside there; the top-bar icon and the dashboard card still open the panel.
 *
 * While the panel is open the button zooms out but stays MOUNTED: the drawer's
 * focus trap remembers it as the opener and hands focus back to it on close.
 * Once the zoom has finished it is visibility hidden, so it is out of sight,
 * out of the tab order and out of the accessibility tree.
 */
export default function AssistantLauncher() {
  const assistant = useAssistantOptional();
  const pathname = usePathname() || '';
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const theme = useTheme();
  if (!assistant || !assistant.enabled) return null;
  if (pathname.startsWith('/student/sketchbook')) return null;
  const open = assistant.open;

  return (
    <Zoom in={!open} timeout={reduce ? 0 : undefined}>
      {/* An empty title keeps a hover tooltip from lingering over the open panel. */}
      <Tooltip title={open ? '' : 'Neram Assistant'} placement="left">
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
            // Focus lands back here when the panel closes; make it visible.
            '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
          }}
        >
          <AutoAwesomeOutlinedIcon />
        </Fab>
      </Tooltip>
    </Zoom>
  );
}
