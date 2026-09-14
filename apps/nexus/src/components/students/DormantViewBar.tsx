'use client';

import { Box, Chip, alpha, useTheme } from '@neram/ui';
import type { DormantView } from '@/lib/not-started';
import { dormantColor, notStartedColor } from '@/lib/student-stage';

/**
 * The narrowing inside the Dormant segment: two kinds of dormant, and the one
 * moment staff should look at again.
 *
 *   Everyone          every dormant student
 *   Not started       never entered Nexus; leaves on its own when they get in
 *   Paused by staff   a person decided, with a reason; only staff bring them back
 *   Back in Nexus     paused, but opened Nexus since (shown only when there are some)
 *
 * The counts are the filters, like the segment bar above it. "Joined over 2 weeks
 * ago" is the view the Needs attention row opens; it shows as a removable chip so
 * the narrowing is never invisible.
 */
const OPTIONS: Array<{ view: DormantView; label: string }> = [
  { view: 'all', label: 'Everyone' },
  { view: 'not_started', label: 'Not started' },
  { view: 'paused', label: 'Paused by staff' },
  { view: 'back_in_nexus', label: 'Back in Nexus' },
];

export default function DormantViewBar({
  value,
  counts,
  onChange,
}: {
  value: DormantView;
  counts: Record<DormantView, number>;
  onChange: (view: DormantView) => void;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const selectedView = value === 'not_started_long' ? 'not_started' : value;

  const accent = (view: DormantView) =>
    view === 'not_started'
      ? notStartedColor(mode)
      : view === 'back_in_nexus'
        ? theme.palette.warning.dark
        : mode === 'dark'
          ? dormantColor(mode)
          : '#475569';

  return (
    <Box
      role="tablist"
      aria-label="Filter dormant students"
      sx={{
        display: 'flex',
        gap: 0.75,
        alignItems: 'center',
        overflowX: 'auto',
        pb: 0.5,
        maxWidth: '100%',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {OPTIONS.filter((o) => o.view !== 'back_in_nexus' || counts.back_in_nexus > 0 || value === 'back_in_nexus').map(
        ({ view, label }) => {
          const active = selectedView === view;
          const color = accent(view);
          const count = counts[view] ?? 0;
          return (
            <Chip
              key={view}
              role="tab"
              aria-selected={active}
              aria-label={`${label}, ${count} students`}
              onClick={() => onChange(view)}
              label={`${label} (${count})`}
              variant={active ? 'filled' : 'outlined'}
              sx={{
                minHeight: 44,
                borderRadius: 2,
                flexShrink: 0,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                // Selected is a solid outline plus a tint, so it never reads as disabled.
                border: `${active ? 2 : 1}px solid ${alpha(color, active ? 1 : 0.45)}`,
                bgcolor: active ? alpha(color, 0.12) : 'transparent',
                color: active ? color : 'text.primary',
                '&:hover': { bgcolor: alpha(color, active ? 0.22 : 0.08) },
              }}
            />
          );
        },
      )}
      {value === 'not_started_long' && (
        <Chip
          label={`Joined over 2 weeks ago (${counts.not_started_long})`}
          // The whole 44px chip clears the filter, not just the small cross.
          onClick={() => onChange('not_started')}
          onDelete={() => onChange('not_started')}
          aria-label="Showing students Not started for over 2 weeks. Remove this filter"
          sx={{
            minHeight: 44,
            borderRadius: 2,
            flexShrink: 0,
            fontWeight: 700,
            fontSize: '0.8rem',
            bgcolor: alpha(theme.palette.warning.main, 0.16),
            color: 'warning.dark',
            '& .MuiChip-deleteIcon': { color: 'warning.dark', fontSize: 22 },
          }}
        />
      )}
    </Box>
  );
}
