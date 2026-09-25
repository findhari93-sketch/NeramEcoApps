'use client';

import { Box, CardActionArea, Typography, alpha, useTheme } from '@neram/ui';
import { FOLLOWUP_META, type FollowupState, type FollowupTone } from '@/lib/class-followup';

/**
 * The founder's four cases for the students who missed a class, as one 2x2
 * grid: told us why (or said nothing) against caught up (or not yet).
 *
 * The same grid sits on the class drawer's "How this class went" card and at
 * the top of the attendance panel's Missed tab, so the two can never tell a
 * teacher different numbers. On the card a corner opens the panel at that
 * group; in the panel a corner IS the filter (pressed shows only that group,
 * pressed again shows everyone).
 */

export type GridState = 'caught_up' | 'catching_up' | 'caught_up_silent' | 'needs_call';
export type GridCounts = Record<GridState, number>;

const WORD: Record<GridState, string> = {
  caught_up: 'All done',
  catching_up: 'Follow up',
  caught_up_silent: 'Ask why',
  needs_call: 'Needs a call',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function useToneColor() {
  const theme = useTheme();
  return (tone: FollowupTone) => (tone === 'neutral' ? theme.palette.grey[500] : theme.palette[tone].main);
}

function Corner({
  state,
  count,
  density,
  pressed,
  onPress,
}: {
  state: GridState;
  count: number;
  density: 'card' | 'compact';
  pressed?: boolean;
  onPress?: () => void;
}) {
  const toneColor = useToneColor();
  const color = toneColor(FOLLOWUP_META[state].tone);
  const empty = count === 0;
  const word = WORD[state];
  const compact = density === 'compact';

  const body = compact ? (
    <Box
      sx={{
        minHeight: 48,
        px: 1.25,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderLeft: `4px solid ${empty ? 'transparent' : color}`,
      }}
    >
      <Typography
        component="span"
        sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: empty ? 'text.disabled' : 'text.primary' }}
      >
        {count}
      </Typography>
      <Typography
        component="span"
        variant="body2"
        sx={{ fontWeight: 600, lineHeight: 1.2, color: empty ? 'text.disabled' : 'text.secondary', minWidth: 0 }}
      >
        {word}
      </Typography>
    </Box>
  ) : (
    <Box
      sx={{
        minHeight: 64,
        px: 1.25,
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        borderLeft: `4px solid ${empty ? 'transparent' : color}`,
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1, color: empty ? 'text.disabled' : 'text.primary' }}>
        {count}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600, color: empty ? 'text.disabled' : 'text.secondary', lineHeight: 1.3 }}>
        {word}
      </Typography>
    </Box>
  );

  const frameSx = {
    borderRadius: 1.5,
    overflow: 'hidden',
    bgcolor: empty ? 'transparent' : alpha(color, pressed ? 0.2 : 0.08),
    border: pressed ? '2px solid' : '1px solid',
    borderColor: empty ? 'divider' : pressed ? color : alpha(color, 0.35),
    transition: 'background-color 150ms ease, border-color 150ms ease',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  } as const;

  if (empty || !onPress) return <Box sx={frameSx}>{body}</Box>;

  if (compact) {
    return (
      <Box sx={frameSx}>
        <CardActionArea
          onClick={onPress}
          aria-pressed={!!pressed}
          aria-label={`${plural(count, 'student')}: ${FOLLOWUP_META[state].label}.${pressed ? ' Showing only them.' : ' Show only them.'}`}
          data-testid={`followup-cell-${state}`}
          sx={{ '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: -2 } }}
        >
          {body}
        </CardActionArea>
      </Box>
    );
  }

  return (
    <Box sx={frameSx}>
      <CardActionArea
        onClick={onPress}
        aria-label={`${plural(count, 'student')}: ${FOLLOWUP_META[state].label}. Show them.`}
        sx={{ '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: -2 } }}
      >
        {body}
      </CardActionArea>
    </Box>
  );
}

export default function FollowupGrid({
  counts,
  density = 'card',
  selected = null,
  onSelect,
}: {
  counts: GridCounts;
  density?: 'card' | 'compact';
  /** The corner that is pressed (compact, as a filter). */
  selected?: FollowupState | null;
  /** Card: open that group. Compact: toggle the filter. */
  onSelect?: (state: GridState) => void;
}) {
  const compact = density === 'compact';
  const cell = (state: GridState) => (
    <Corner
      state={state}
      count={counts[state]}
      density={density}
      pressed={compact && selected === state}
      onPress={onSelect ? () => onSelect(state) : undefined}
    />
  );
  return (
    <Box
      role="group"
      aria-label="Who missed it, by reason and catch-up"
      data-testid="followup-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: compact ? 'auto minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(64px, auto) minmax(0, 1fr) minmax(0, 1fr)',
        columnGap: 1,
        rowGap: compact ? 0.75 : 1,
        alignItems: 'stretch',
      }}
    >
      <span />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, alignSelf: 'end', lineHeight: 1.2 }}>
        Caught up
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, alignSelf: 'end', lineHeight: 1.2 }}>
        Not yet
      </Typography>

      <Typography variant="caption" sx={{ fontWeight: 700, alignSelf: 'center', lineHeight: 1.2 }}>
        Told us why
      </Typography>
      {cell('caught_up')}
      {cell('catching_up')}

      <Typography variant="caption" sx={{ fontWeight: 700, alignSelf: 'center', lineHeight: 1.2 }}>
        Said nothing
      </Typography>
      {cell('caught_up_silent')}
      {cell('needs_call')}
    </Box>
  );
}
