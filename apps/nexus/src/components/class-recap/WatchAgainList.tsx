'use client';

/**
 * Classes the student sat in, offered back to them.
 *
 * The second tab of the catch-up screen, and the whole reason the Study Zone no
 * longer carries a separate "Class Recaps" item. That list showed every recap in
 * the classroom whether the student owed it or not, so it looked like a to-do
 * list without being one: finishing a video there did real work against a
 * catch-up item and never said so, and it never started the clock, so a student
 * doing exactly what was asked still read as stalled to their teacher.
 *
 * This list is the opposite by construction. The server has already removed
 * anything outstanding, so nothing here is owed, and the design says so by
 * leaving things out: no coloured status rail, no days-left chip, no warning
 * colour, no three-bar gate strip, no percentage. A card carries a date, a
 * title, and whether they have been through it before.
 *
 * Built at 375px first. One column, 48px minimum targets, and the same card
 * radius and shadow as the missed-class cards above it so the two tabs read as
 * one screen rather than two.
 */

import { useRouter } from 'next/navigation';
import { Box, Typography, Stack, Chip } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';
import type { RewatchableRecap } from '@/lib/rewatchable-recaps';

interface WatchAgainListProps {
  items: RewatchableRecap[];
  /** More exist than were sent, so the list can say so rather than imply it is all of them. */
  truncated?: boolean;
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function WatchAgainList({ items, truncated = false }: WatchAgainListProps) {
  const router = useRouter();

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Classes you were in. Nothing to finish here and nothing is timed. Watch any of them again
        whenever you like.
      </Typography>

      <Stack spacing={1}>
        {items.map((item) => (
          <Box
            key={item.recap_id}
            component="button"
            type="button"
            onClick={() => router.push(`/student/class-recap/${item.recap_id}`)}
            sx={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              cursor: 'pointer',
              p: 1.75,
              minHeight: 48,
              borderRadius: RADIUS.card,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              boxShadow: SHADOW.card,
              transition: 'border-color .16s ease, box-shadow .16s ease',
              '&:hover': { borderColor: 'primary.light', boxShadow: SHADOW.lift },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '.04em' }}
                >
                  {formatDay(item.date)}
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.35, mt: 0.25 }}>
                  {item.title}
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                  sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.75 }}
                  useFlexGap
                >
                  <Chip
                    size="small"
                    icon={item.watched ? <CheckCircleIcon /> : <PlayCircleOutlineIcon />}
                    label={item.watched ? 'Watch again' : 'Watch'}
                    variant="outlined"
                    sx={{ height: 24, fontWeight: 600, color: 'text.secondary' }}
                  />
                  {item.section_count > 0 && (
                    <Typography variant="caption" color="text.disabled">
                      {item.section_count} part{item.section_count === 1 ? '' : 's'}
                    </Typography>
                  )}
                </Stack>
              </Box>
              <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
            </Stack>
          </Box>
        ))}
      </Stack>

      {truncated && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
          Showing your {items.length} most recent classes.
        </Typography>
      )}
    </Box>
  );
}
