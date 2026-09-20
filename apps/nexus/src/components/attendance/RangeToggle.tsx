'use client';

/**
 * How far back the attendance screen looks.
 *
 * A segmented control, not a row of tabs. This used to be a Tabs row stacked
 * directly above the Classes / Register / Students tabs, which made attendance
 * the only page in the teacher app with two tab levels, and read as though
 * picking a range navigated somewhere. It does not: the view stays exactly
 * where it was and only the window of data behind it moves. A segmented control
 * says "this is a setting on what you are looking at"; a tab row says "this is
 * somewhere else you can go", and only one of those is true here.
 *
 * It is rendered into PageHeader's `action` slot, so on a phone it takes its own
 * full width row below the title instead of fighting the title for space.
 */
import { ToggleButton, ToggleButtonGroup } from '@neram/ui';

export const RANGES = [14, 30, 90] as const;
export type RangeKey = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeKey = 30;

const LABEL: Record<RangeKey, string> = {
  14: '2 weeks',
  30: '30 days',
  90: '90 days',
};

/** Narrows whatever came out of the query string, which is a string or null. */
export function toRangeKey(value: unknown): RangeKey {
  const n = Number(value);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeKey) : DEFAULT_RANGE;
}

export default function RangeToggle({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      fullWidth
      size="small"
      aria-label="How far back to look"
      /**
       * Pressing the segment that is already selected hands back null. There is
       * no "no range" for this screen to show, so that press means nothing and
       * is ignored, rather than emptying the page.
       */
      onChange={(_event, next) => {
        if (next != null) onChange(next as RangeKey);
      }}
      sx={{
        '& .MuiToggleButton-root': {
          textTransform: 'none',
          fontWeight: 600,
          // The app's floor for a tap target, and taller than ToggleButton's
          // own `size="small"` would otherwise give.
          minHeight: 44,
          px: 1.75,
          whiteSpace: 'nowrap',
        },
      }}
    >
      {RANGES.map((days) => (
        <ToggleButton key={days} value={days} aria-label={`Last ${LABEL[days]}`}>
          {LABEL[days]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
