'use client';

import { cloneElement, isValidElement, type ReactElement } from 'react';
import { Badge, Box, Typography, alpha, useTheme } from '@neram/ui';
import { useStudentZoneContext } from '@/components/StudentZoneProvider';
import { useNavBadges } from '@/components/NavBadgeProvider';

/**
 * Compact segmented control for switching student zones
 * (Study Zone / Classroom), shown in the top nav bar.
 *
 * Mirrors PanelSwitcher (the staff Teach/Manage/Admin pill) but reads the
 * student zone context, so the active zone stays in sync with the profile-menu
 * "Switch Zone" list. Renders nothing when there is only one available zone,
 * which also self-hides it on teacher pages (no StudentZoneProvider there, so
 * the default context exposes an empty availableZones). Only the ACTIVE segment
 * shows its label; the other is icon-only to keep the pill tight.
 */

// Height of each segment, and the width of an icon-only (inactive) segment.
// 34px keeps a comfortable tap area without making the pill tall.
const SEGMENT = 34;

export default function ZoneSwitcher({ accent }: { accent?: string }) {
  const theme = useTheme();
  const { activeZone, setActiveZone, availableZones } = useStudentZoneContext();
  const { getBadgeCount } = useNavBadges();

  const roleAccent = accent || theme.palette.primary.main;

  // Nothing to switch between → no control.
  if (availableZones.length <= 1) return null;

  return (
    <Box
      role="group"
      aria-label="Switch zone"
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
      {availableZones.map((zone) => {
        const isActive = zone.id === activeZone;

        // Work waiting in the OTHER zone. Only on the inactive segment: once a
        // student is in that zone the bottom bar's "More" already carries the
        // same number, and two counts for one thing reads as two things.
        const waiting = !isActive && zone.badgePath ? getBadgeCount(zone.badgePath) : 0;

        // Normalize the configured icon to one consistent size and strip its
        // baseline gap (display:block) so it centers cleanly with the label.
        const icon = isValidElement(zone.icon)
          ? cloneElement(zone.icon as ReactElement<{ sx?: Record<string, unknown> }>, {
              sx: { fontSize: '1.1rem', display: 'block' },
            })
          : zone.icon;

        return (
          <Box
            key={zone.id}
            component="button"
            type="button"
            onClick={() => {
              if (!isActive) setActiveZone(zone.id);
            }}
            aria-pressed={isActive}
            aria-label={waiting > 0 ? `${zone.label}, ${waiting} to catch up` : zone.label}
            title={waiting > 0 ? `${zone.label} (${waiting} to catch up)` : zone.label}
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
            <Badge
              badgeContent={waiting}
              color="error"
              max={9}
              sx={{
                display: 'flex',
                lineHeight: 0,
                '& .MuiBadge-badge': {
                  fontSize: '0.55rem',
                  height: 14,
                  minWidth: 14,
                  padding: '0 3px',
                  top: 1,
                  right: 1,
                },
              }}
            >
              {icon}
            </Badge>
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
                {zone.label}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
