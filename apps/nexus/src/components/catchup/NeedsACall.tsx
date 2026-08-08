'use client';

/**
 * We asked, and nothing moved.
 *
 * The chase groups below this answer "what is wrong", which is a fact about the
 * work. This answers "who is not answering us", which is a fact about a person,
 * and the two need separating because only the second justifies a phone call
 * home. A student with eleven classes outstanding who started one yesterday is
 * doing exactly what we asked; a student with two who has ignored a nudge for a
 * fortnight is not, and the raw counts rank them the wrong way round.
 *
 * Two rules keep it honest.
 *
 * Nobody appears here until they have actually been nudged. Silence from a
 * student we never contacted is our failure, and putting them on a list a
 * teacher reads as "ignoring us" would launder that into their record.
 *
 * And the order comes from `ownOpen`, never the total. Late-joiner backlog is
 * shown on the row because a teacher making the call needs to know about it, but
 * it cannot move anybody up the list. Otherwise the newest student in the room,
 * who has missed nothing since arriving, sorts to the top of the worst list on
 * the screen.
 *
 * This tab is staff-only and no part of it reaches a student. That is deliberate
 * and is the counterpart to the all-clear wall, which is public and carries no
 * numbers about anybody behind.
 */
import { useState } from 'react';
import { Box, Button, Stack, Typography, alpha, useTheme } from '@neram/ui';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { timeAgo } from './shared';
import type { Row } from './types';

/** Enough to make a round of calls from. More is a report, not a to-do list. */
const FIRST_PAGE = 10;

export interface NeedsACallProps {
  rows: Row[];
  /** Ticks these students for the bulk nudge bar. Same handler the groups use. */
  onSelect: (rows: Row[]) => void;
}

export default function NeedsACall({ rows, onSelect }: NeedsACallProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return null;

  const shown = expanded ? rows : rows.slice(0, FIRST_PAGE);
  const tint = theme.palette.error.main;

  return (
    <Box
      // A stable hook for the test that pins the ordering rule. The names also
      // appear in the groups below, so asserting on document order alone cannot
      // tell the pinned list from the rest of the screen.
      data-testid="needs-a-call"
      sx={{
        mb: 2.5,
        p: { xs: 1.5, sm: 2 },
        borderRadius: RADIUS.card,
        border: '1px solid',
        borderColor: alpha(tint, 0.35),
        bgcolor: alpha(tint, 0.04),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ gap: 1, mb: 1, flexWrap: 'wrap' }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {/* An icon as well as the red, because colour alone is not a label. */}
          <PhoneInTalkOutlinedIcon aria-hidden sx={{ color: tint, fontSize: 20 }} />
          <Box>
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 800,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: tint,
              }}
            >
              Needs a call · {rows.length}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Nudged already, and nothing opened, watched or started since.
            </Typography>
          </Box>
        </Stack>

        {rows.length > 1 && (
          <Button
            size="small"
            onClick={() => onSelect(rows)}
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44, flexShrink: 0 }}
          >
            Select these
          </Button>
        )}
      </Stack>

      <Stack spacing={1}>
        {shown.map((row) => (
          <Stack
            key={row.student.id}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              p: 1,
              minHeight: 56,
              borderRadius: RADIUS.control,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <StudentAvatar
              userId={row.student.id}
              src={row.student.avatar_url}
              name={row.student.name || ''}
              size={36}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
                {row.student.name || row.student.email || 'Student'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {backlogLine(row)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {silenceLine(row)}
              </Typography>
            </Box>
            {row.student.phone && (
              <Button
                size="small"
                href={`tel:${row.student.phone}`}
                sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
              >
                Call
              </Button>
            )}
          </Stack>
        ))}
      </Stack>

      {rows.length > FIRST_PAGE && (
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          sx={{ mt: 1, textTransform: 'none', fontWeight: 700, minHeight: 44 }}
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      )}
    </Box>
  );
}

/**
 * The two backlogs, never added together.
 *
 * A pure late joiner reads "12 from before they joined" with no first clause at
 * all, which is the sentence a teacher needs before dialling: this person has
 * not missed anything, they arrived late.
 */
function backlogLine(row: Row): string {
  const { ownOpen, lateJoinerOpen } = row.standing;
  const parts: string[] = [];
  if (ownOpen > 0) parts.push(ownOpen === 1 ? '1 class of their own' : `${ownOpen} classes of their own`);
  if (lateJoinerOpen > 0) parts.push(`${lateJoinerOpen} from before they joined`);
  return parts.length ? parts.join(' · ') : 'Nothing outstanding';
}

/** How long the silence has run, from both ends. */
function silenceLine(row: Row): string {
  const { oldestOpenDays, chasedAt } = row.standing;
  const parts: string[] = [];
  if (typeof oldestOpenDays === 'number') {
    parts.push(oldestOpenDays === 1 ? 'oldest 1 day' : `oldest ${oldestOpenDays} days`);
  }
  if (chasedAt) parts.push(`chased ${timeAgo(chasedAt)}`);
  return parts.join(' · ');
}
