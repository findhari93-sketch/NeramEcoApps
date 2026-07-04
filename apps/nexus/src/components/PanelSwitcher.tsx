'use client';

import { cloneElement, isValidElement, type ReactElement } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { usePanelContext } from '@/components/PanelProvider';

/**
 * Compact segmented control for switching Nexus workspaces
 * (Teach / Manage / Admin), shown in the top nav bar.
 *
 * Reuses the same panel context as the profile-menu switcher, so the active
 * workspace stays in sync everywhere. Renders nothing for users with a single
 * panel. Only the ACTIVE segment shows its label; inactive segments are
 * icon-only (on every viewport) to keep the pill tight.
 */

// Shortened labels for the tight top-nav pill. The profile menu keeps the full
// labels ("Teaching" / "Management" / "Admin"); these are the compact form.
const SHORT_LABELS: Record<string, string> = {
  teaching: 'Teach',
  management: 'Manage',
  admin: 'Admin',
};

// Height of each segment, and the width of an icon-only (inactive) segment.
// 34px keeps a comfortable tap area without making the pill tall.
const SEGMENT = 34;

export default function PanelSwitcher({ accent }: { accent?: string }) {
  const theme = useTheme();
  const { activePanel, setActivePanel, availablePanels } = usePanelContext();

  const roleAccent = accent || theme.palette.primary.main;

  // Nothing to switch between → no control.
  if (availablePanels.length <= 1) return null;

  return (
    <Box
      role="group"
      aria-label="Switch workspace"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        p: 0.375,
        borderRadius: 2.5,
        border: `1px solid ${alpha(roleAccent, 0.18)}`,
        bgcolor: alpha(roleAccent, 0.05),
      }}
    >
      {availablePanels.map((panel) => {
        const isActive = panel.id === activePanel;
        const label = SHORT_LABELS[panel.id] || panel.label;

        // Normalize the configured icon to one consistent size and strip its
        // baseline gap (display:block) so it centers cleanly with the label.
        const icon = isValidElement(panel.icon)
          ? cloneElement(panel.icon as ReactElement<{ sx?: Record<string, unknown> }>, {
              sx: { fontSize: '1.1rem', display: 'block' },
            })
          : panel.icon;

        return (
          <Box
            key={panel.id}
            component="button"
            type="button"
            onClick={() => {
              if (!isActive) setActivePanel(panel.id);
            }}
            aria-pressed={isActive}
            aria-label={panel.label}
            title={panel.label}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isActive ? 0.625 : 0,
              height: SEGMENT,
              minWidth: SEGMENT,
              px: isActive ? 1.25 : 0,
              py: 0,
              borderRadius: 2,
              border: 'none',
              cursor: isActive ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background-color 160ms ease, color 160ms ease',
              color: isActive ? '#fff' : 'text.secondary',
              bgcolor: isActive ? roleAccent : 'transparent',
              boxShadow: isActive ? `0 1px 2px ${alpha(roleAccent, 0.35)}` : 'none',
              '&:hover': isActive
                ? {}
                : { bgcolor: alpha(roleAccent, 0.1), color: roleAccent },
            }}
          >
            {/* lineHeight:0 flex wrapper removes the SVG line-box gap, so the
                icon sits on the true vertical center of the segment. */}
            <Box sx={{ display: 'flex', lineHeight: 0 }}>{icon}</Box>
            {isActive && (
              <Typography
                component="span"
                noWrap
                sx={{
                  fontSize: '0.78rem',
                  lineHeight: 1,
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  color: 'inherit',
                }}
              >
                {label}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
