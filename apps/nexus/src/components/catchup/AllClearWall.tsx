'use client';

/**
 * Everyone who owes nothing.
 *
 * The one screen in Nexus that says something good about a student by name, and
 * the reason it did not exist before is structural rather than an oversight: the
 * overview route dropped anyone with no open work before the page saw them, so
 * the only group worth congratulating was the only group deleted from the
 * payload.
 *
 * Three rules hold this together, and all three are about not turning it into a
 * ranking by accident:
 *
 * It is ordered by who finished most recently, never by how fast or how much. A
 * list of people sorted by achievement has a bottom, and the student at the
 * bottom of a wall of winners learns something we did not mean to teach.
 *
 * Nothing here is numbered. No positions, no medals, no "top three".
 *
 * And there is no counterpart. Whoever is behind is on the Needs action tab,
 * which students never see, and no number from that tab is repeated here. This
 * list can be read out in class or posted to Teams exactly as it stands, which
 * is the test it has to pass.
 */
import { useMemo, useState } from 'react';
import { Box, Button, Chip, Stack, Typography, alpha, useTheme } from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { RADIUS } from '@/components/timetable/timetable-theme';
import StudentAvatar from '@/components/students/StudentAvatar';
import { SECTION_HEADING_SX, timeAgo } from './shared';
import type { Row } from './types';

/** Shown before "show everyone", so a big cohort does not bury the feed below. */
const FIRST_PAGE = 12;

export interface AllClearWallProps {
  students: Row[];
  /** Opens the Teams preview. Absent when this classroom has nowhere to post. */
  onShare?: (students: Row[]) => void;
  busy?: boolean;
}

export default function AllClearWall({ students, onShare, busy }: AllClearWallProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Most recently finished first. `lastClearedAt` is null for a student who has
  // never missed a class at all, and they sort last rather than first: they
  // belong here (they owe nothing) but they did not just do anything, so leading
  // the list with them would bury the person who cleared their backlog today.
  const ordered = useMemo(
    () =>
      [...students].sort((a, b) => {
        const av = a.standing.lastClearedAt;
        const bv = b.standing.lastClearedAt;
        if (av && bv) return bv.localeCompare(av);
        if (av) return -1;
        if (bv) return 1;
        return (a.student.name || '').localeCompare(b.student.name || '');
      }),
    [students],
  );

  const shown = expanded ? ordered : ordered.slice(0, FIRST_PAGE);

  if (ordered.length === 0) {
    return (
      <Box
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: RADIUS.card,
          border: '1px dashed',
          borderColor: 'divider',
          textAlign: 'center',
        }}
      >
        <EmojiEventsOutlinedIcon sx={{ color: 'text.disabled', fontSize: 28, mb: 0.5 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
          Nobody is completely clear yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          A student lands here the moment they have nothing left to catch up on. Clearing the
          recaps they are waiting on is usually the quickest way to fill this.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1, gap: 1, flexWrap: 'wrap' }}
      >
        <Typography sx={SECTION_HEADING_SX}>All clear ({ordered.length})</Typography>
        {onShare && (
          <Button
            size="small"
            variant="outlined"
            color="success"
            disabled={busy}
            startIcon={<CampaignOutlinedIcon />}
            onClick={() => onShare(ordered)}
            // 44px is the minimum comfortable tap target, and a teacher presses
            // this on a phone between classes.
            sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44, borderRadius: 2 }}
          >
            Share in Teams
          </Button>
        )}
      </Stack>

      <Box
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: RADIUS.card,
          border: '1px solid',
          borderColor: alpha(theme.palette.success.main, 0.35),
          bgcolor: alpha(theme.palette.success.main, 0.05),
        }}
      >
        <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600 }}>
          These students have nothing left to catch up on. Worth saying so out loud.
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
          }}
        >
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
                borderColor: alpha(theme.palette.success.main, 0.25),
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
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {describeClear(row)}
                </Typography>
              </Box>
              {/*
                A tick as well as the green, because colour on its own is not a
                label to anyone who cannot separate these two greens.
              */}
              <CheckCircleIcon
                aria-hidden
                sx={{ color: 'success.main', fontSize: 20, flexShrink: 0 }}
              />
            </Stack>
          ))}
        </Box>

        {ordered.length > FIRST_PAGE && (
          <Button
            size="small"
            onClick={() => setExpanded((v) => !v)}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 700, minHeight: 44 }}
          >
            {expanded ? 'Show fewer' : `Show all ${ordered.length}`}
          </Button>
        )}
      </Box>
    </Box>
  );
}

/**
 * The one line under a name.
 *
 * Says what they did and when, and nothing comparative. A student who never
 * missed a class has no catch-up history to report, so they get their own
 * sentence rather than a hollow "cleared 0 classes".
 */
function describeClear(row: Row): string {
  const { clearedTotal, lastClearedAt } = row.standing;
  if (clearedTotal === 0) return 'Has not missed a class';
  const what = clearedTotal === 1 ? 'Cleared 1 class' : `Cleared ${clearedTotal} classes`;
  const when = lastClearedAt ? timeAgo(lastClearedAt) : '';
  return when ? `${what} · last one ${when}` : what;
}

/** Exported for the Teams preview, which names the same people in the same order. */
export function allClearNames(students: Row[]): string[] {
  return students.map((s) => s.student.name || s.student.email || 'Student');
}

/** The chip the tab header uses, kept here so the wording lives with the wall. */
export function AllClearCountChip({ n }: { n: number }) {
  return (
    <Chip
      size="small"
      color="success"
      label={`${n} all clear`}
      sx={{ height: 22, fontWeight: 700, fontSize: '0.7rem' }}
    />
  );
}
