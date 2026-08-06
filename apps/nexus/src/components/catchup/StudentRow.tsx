'use client';

/**
 * One student, once.
 *
 * The tab used to draw every student twice: a chase row at the top carrying Call
 * and Nudge, and a separate expandable card further down carrying the gates and
 * Excuse. Two copies of the same person, a screen apart, each holding half the
 * actions. At a hundred students that was two hundred rows, and acting on one
 * person meant finding them in both places.
 *
 * So the row IS the card. Collapsed it answers "who and how bad"; expanded it
 * answers "stuck on what", in the same place, without moving.
 */
import { memo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  IconButton,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { describeReason } from '@/lib/rsvp-reasons';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { Gates, owedLine, shortDate } from './shared';
import type { Item, ItemAction, Row } from './types';

/** Below this the row swaps its labelled buttons for icons. Matches the theme's sm. */
const COMPACT_ACTIONS_SX = { display: { xs: 'inline-flex', sm: 'none' } } as const;
const FULL_ACTIONS_SX = { display: { xs: 'none', sm: 'inline-flex' } } as const;

/**
 * Everything worth saying out loud on the call: when it was, what they said in
 * their own words, and how late it is. `describeReason` prefers the typed note
 * over the category, because "Hospital visit" says more than "Family".
 */
export function itemLine(item: Item): string {
  const bits = [shortDate(item.class.scheduled_date)];
  if (item.reason_code) {
    const said = describeReason(item.reason_code, item.reason_note);
    bits.push(item.reason_note ? `"${said}"` : said);
  }
  // Only the class they actually started has a clock. Saying "due" about one
  // they have not touched was how every card ended up looking late.
  if (item.overdue) {
    bits.push(`ran over ${item.due_on ? shortDate(item.due_on) : ''}`.trim());
  } else if (item.active && item.due_on) {
    bits.push(
      typeof item.days_left === 'number'
        ? `${item.days_left === 1 ? '1 day' : `${item.days_left} days`} left`
        : `due ${shortDate(item.due_on)}`,
    );
  } else {
    bits.push('not started');
  }
  return bits.join(' · ');
}

export interface StudentRowProps {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  /** Null when not selecting. Non-null swaps the actions for a checkbox. */
  selected: boolean | null;
  onSelect: (next: boolean) => void;
  /** False in the groups where a nudge would be dishonest, so it is not offered. */
  nudgeable: boolean;
  busy: string | null;
  onAct: (itemId: string, action: ItemAction) => void;
  onNudge: (studentId: string, journeyId: string | null) => void;
}

function StudentRowBase({
  row,
  expanded,
  onToggle,
  selected,
  onSelect,
  nudgeable,
  busy,
  onAct,
  onNudge,
}: StudentRowProps) {
  const theme = useTheme();
  const selecting = selected !== null;
  const name = row.student.name || row.student.email || 'Student';
  const urgent = row.bucket === 'run_over';

  return (
    <Box
      sx={{
        borderRadius: RADIUS.control,
        border: '1px solid',
        borderColor: urgent ? alpha(theme.palette.error.main, 0.4) : 'divider',
        bgcolor: urgent ? alpha(theme.palette.error.main, 0.04) : 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${name}, ${owedLine(row)}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 1,
          minHeight: 64,
          cursor: 'pointer',
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: -2,
          },
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
          transition: 'background-color 160ms ease',
        }}
      >
        {selecting && (
          <Checkbox
            checked={!!selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSelect(e.target.checked)}
            inputProps={{ 'aria-label': `Select ${name}` }}
            sx={{ width: 44, height: 44, flexShrink: 0 }}
          />
        )}

        <StudentAvatar
          userId={row.student.id}
          src={row.student.avatar_url}
          name={row.student.name || ''}
          size={36}
        />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {owedLine(row)}
          </Typography>
        </Box>

        {/* Selecting is not acting. Swapping the buttons out rather than
            squeezing a checkbox in beside them is what keeps a name readable at
            375px, where four controls on one line leaves nothing for the name. */}
        {!selecting && (
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {row.student.phone && (
              <>
                <IconButton
                  href={`tel:${row.student.phone}`}
                  aria-label={`Call ${name}`}
                  sx={{ ...COMPACT_ACTIONS_SX, width: 44, height: 44 }}
                >
                  <PhoneOutlinedIcon fontSize="small" />
                </IconButton>
                <Button
                  size="small"
                  variant="outlined"
                  href={`tel:${row.student.phone}`}
                  startIcon={<PhoneOutlinedIcon />}
                  sx={{ ...FULL_ACTIONS_SX, minHeight: 40, textTransform: 'none' }}
                >
                  Call
                </Button>
              </>
            )}
            {nudgeable && (
              <>
                <IconButton
                  color="primary"
                  disabled={busy === row.student.id}
                  onClick={() => onNudge(row.student.id, row.journey_id)}
                  aria-label={`Nudge ${name}`}
                  sx={{ ...COMPACT_ACTIONS_SX, width: 44, height: 44 }}
                >
                  <NotificationsActiveOutlinedIcon fontSize="small" />
                </IconButton>
                <Button
                  size="small"
                  variant="contained"
                  disabled={busy === row.student.id}
                  onClick={() => onNudge(row.student.id, row.journey_id)}
                  sx={{ ...FULL_ACTIONS_SX, minHeight: 40, textTransform: 'none' }}
                >
                  Nudge
                </Button>
              </>
            )}
          </Stack>
        )}

        <ExpandMoreIcon
          sx={{
            flexShrink: 0,
            color: 'text.disabled',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Stack spacing={0} sx={{ px: 1.5, pb: 1.5 }}>
          {row.items.map((item) => (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
                borderTop: '1px solid',
                borderColor: 'divider',
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {item.class.title || 'Class'}
                </Typography>
                <Typography
                  variant="caption"
                  color={item.overdue ? 'error.main' : 'text.disabled'}
                  sx={{ display: 'block' }}
                >
                  {itemLine(item)}
                </Typography>
              </Box>
              <Gates item={item} />
              <Button
                size="small"
                disabled={busy === item.id}
                onClick={() => onAct(item.id, item.excused ? 'restore' : 'excuse')}
                sx={{ textTransform: 'none', minHeight: 44, minWidth: 76 }}
              >
                {item.excused ? 'Restore' : 'Excuse'}
              </Button>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

/**
 * Memoised because the tab re-renders on every keystroke in the search box, and
 * a cohort of a hundred rows re-rendering per character is what makes a filter
 * feel broken on a phone.
 */
export default memo(StudentRowBase);
