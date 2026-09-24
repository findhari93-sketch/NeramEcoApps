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
 *
 * 2026-10: the second line is the diagnosis ("Stopped on "Pritzker Prize" at
 * 40% watched, last active 5 days ago") rather than a count, and tapping the
 * row opens the student sheet (StudentSheet) with every class, its reason and
 * how far they got. The inline expand was a list inside a list.
 */
import { memo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  IconButton,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { describeReason } from '@/lib/rsvp-reasons';
import { DIAGNOSIS_META } from '@/lib/catchup-diagnosis';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { owedLine, shortDate } from './shared';
import type { Item, Row } from './types';

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
  // The resolved reason first: it also knows what they said on the RSVP or an
  // away window, which the absence row alone never did.
  const r = item.reason;
  if (r) {
    const said = describeReason(r.code, r.note);
    bits.push(r.note ? `"${said}"` : said);
  } else if (item.reason_code) {
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

/** The diagnosis chip colours, from the theme. */
export function useDiagnosisColor() {
  const theme = useTheme();
  return (tone: 'error' | 'warning' | 'info' | 'success' | 'neutral'): string =>
    tone === 'error'
      ? theme.palette.error.main
      : tone === 'warning'
        ? theme.palette.warning.dark
        : tone === 'info'
          ? theme.palette.info.dark
          : tone === 'success'
            ? theme.palette.success.dark
            : theme.palette.text.secondary;
}

export interface StudentRowProps {
  row: Row;
  /** Opens the student sheet. */
  onOpen: () => void;
  /** Null when not selecting. Non-null swaps the actions for a checkbox. */
  selected: boolean | null;
  onSelect: (next: boolean) => void;
  /** False in the groups where a nudge would be dishonest, so it is not offered. */
  nudgeable: boolean;
  busy: string | null;
  onNudge: (studentId: string, journeyId: string | null) => void;
}

function StudentRowBase({
  row,
  onOpen,
  selected,
  onSelect,
  nudgeable,
  busy,
  onNudge,
}: StudentRowProps) {
  const theme = useTheme();
  const selecting = selected !== null;
  const name = row.student.name || row.student.email || 'Student';
  const diagnosis = row.diagnosis;
  const meta = diagnosis ? DIAGNOSIS_META[diagnosis.state] : null;
  const urgent = diagnosis ? diagnosis.state === 'stuck' || diagnosis.state === 'stopped' : row.bucket === 'run_over';
  const line = diagnosis?.sentence || owedLine(row);

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
        aria-haspopup="dialog"
        aria-label={`${name}${meta ? `, ${meta.label}` : ''}, ${line}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
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
          {/* No diagnosis chip here: every row sits under a heading that
              already names it, and at 375px the chip cost the name half its
              characters. The label keeps it for screen readers. */}
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
            {name}
          </Typography>
          {/* Two lines, not one: at 375px a single line cut "1 before joined"
              to "1 before join...", which is the half a teacher needs. */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.35,
            }}
          >
            {line}
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
                  sx={{ ...FULL_ACTIONS_SX, minHeight: 44, textTransform: 'none' }}
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
                  sx={{ ...FULL_ACTIONS_SX, minHeight: 44, textTransform: 'none' }}
                >
                  Nudge
                </Button>
              </>
            )}
          </Stack>
        )}

        <ChevronRightIcon sx={{ flexShrink: 0, color: 'text.disabled' }} />
      </Box>
    </Box>
  );
}

/**
 * Memoised because the tab re-renders on every keystroke in the search box, and
 * a cohort of a hundred rows re-rendering per character is what makes a filter
 * feel broken on a phone.
 */
export default memo(StudentRowBase);
