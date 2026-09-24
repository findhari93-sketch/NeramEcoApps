'use client';

/**
 * Why students missed class, in their own words.
 *
 * This is the tab the whole screen was missing. Every reason a student gives is
 * written to nexus_class_absences.reason_note and, until now, was read by
 * nothing: the overview API never selected the column and the teacher screen
 * only ever rendered the category. A teacher could see that someone had
 * "answered", never what they said.
 *
 * Ordered newest first, because the question being asked is "what came in",
 * not "who owes what" (that is the Needs action tab). Each row carries the
 * student's current catch-up state too, so "he said he was unwell, and he still
 * has not started" is one row rather than two screens.
 */
import { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Stack, Typography, alpha, useTheme } from '@neram/ui';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import { RSVP_REASONS, reasonShortLabel } from '@/lib/rsvp-reasons';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { StateChip, StudentIdentity, shortDate, timeAgo } from './shared';
import type { FeedRow, TabProps } from './types';

/** Who said it. Only shown when it was not the student, which is the norm. */
function SourceTag({ source }: { source: string | null }) {
  const theme = useTheme();
  if (source !== 'parent' && source !== 'teacher') return null;
  return (
    <Chip
      size="small"
      icon={<FamilyRestroomOutlinedIcon sx={{ fontSize: 14 }} />}
      label={source === 'parent' ? 'said by a parent' : 'recorded by staff'}
      sx={{
        height: 20,
        fontSize: '0.68rem',
        fontWeight: 700,
        color: theme.palette.info.dark,
        bgcolor: alpha(theme.palette.info.main, 0.1),
      }}
    />
  );
}

/**
 * How many reasons render before "Show more". Fifty cards at about 200px each
 * made this tab 10,700px on a phone; the newest are the ones a teacher answers.
 */
const PAGE = 15;

export default function ReasonsTab({ data, busy, onNudge }: TabProps) {
  const theme = useTheme();
  const [filter, setFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(
    () => (filter ? data.reasons.filter((r) => r.reason_code === filter) : data.reasons),
    [data.reasons, filter],
  );

  const journeyFor = (studentId: string) =>
    data.students.find((s) => s.student.id === studentId)?.journey_id ?? null;

  if (data.reasons.length === 0) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        Nobody has explained a missed class yet. When a student tells us why they were away, it
        appears here with what they wrote.
      </Alert>
    );
  }

  return (
    <Box>
      <Box role="group" aria-label="Filter reasons by kind" sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          overflowX: 'auto',
          pb: 0.5,
          overscrollBehaviorX: 'contain',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          '& .MuiChip-root': { height: 44, borderRadius: 22, px: 0.5, flexShrink: 0, fontWeight: 700 },
          // Scrolls sideways on a phone instead of wrapping to three lines, and
          // fades at the edge so the hidden pills still announce themselves.
          [theme.breakpoints.down('sm')]: {
            mx: -2,
            px: 2,
            maskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
            WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
          },
        }}>
        <Chip
          label={`All ${data.reasons.length}`}
          onClick={() => {
            setFilter(null);
            setLimit(PAGE);
          }}
          color={filter === null ? 'primary' : 'default'}
          variant={filter === null ? 'filled' : 'outlined'}
        />
        {RSVP_REASONS.map((r) => {
          const n = data.reasonTally?.[r.code] ?? 0;
          if (n === 0) return null;
          const on = filter === r.code;
          return (
            <Chip
              key={r.code}
              label={`${r.shortLabel} ${n}`}
              onClick={() => {
                setFilter(on ? null : r.code);
                setLimit(PAGE);
              }}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
            />
          );
        })}
      </Box>

      {rows.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No reasons in that category.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {rows.slice(0, limit).map((row: FeedRow) => (
            <Box
              key={row.id}
              sx={{
                p: 1.5,
                borderRadius: RADIUS.control,
                border: '1px solid',
                borderColor: row.overdue ? alpha(theme.palette.error.main, 0.4) : 'divider',
                bgcolor: row.overdue
                  ? alpha(theme.palette.error.main, 0.04)
                  : 'background.paper',
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <StudentIdentity
                  student={row.student}
                  secondary={
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {row.class.title || 'Class'} · {shortDate(row.class.scheduled_date)}
                      {/* On a phone the time moves in here, so the header row
                          keeps its width for the name. */}
                      <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                        {' '}· {timeAgo(row.reason_submitted_at)}
                      </Box>
                    </Typography>
                  }
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ whiteSpace: 'nowrap', pt: 0.25, display: { xs: 'none', sm: 'block' } }}
                >
                  {timeAgo(row.reason_submitted_at)}
                </Typography>
                {/* On a phone the actions ride in the header as icons. A row of
                    two buttons under every reason was the other half of each
                    card's height. */}
                <Stack direction="row" sx={{ display: { xs: 'flex', sm: 'none' }, flexShrink: 0, mt: -0.75 }}>
                  {row.student.phone && (
                    <IconButton
                      href={`tel:${row.student.phone}`}
                      aria-label={`Call ${row.student.name || 'student'}`}
                      sx={{ width: 44, height: 44 }}
                    >
                      <PhoneOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
                  {!row.caught_up_at && !row.excused && (
                    <IconButton
                      color="primary"
                      disabled={busy === row.student.id}
                      onClick={() => onNudge(row.student.id, journeyFor(row.student.id))}
                      aria-label={`Nudge ${row.student.name || 'student'}`}
                      sx={{ width: 44, height: 44 }}
                    >
                      <NotificationsActiveOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              </Stack>

              {/* The reason itself. The category is a tag; the quote is what they
                  actually typed, and it is the only thing on this screen that is
                  in the student's own voice. */}
              <Box sx={{ mt: 1, pl: { xs: 0, sm: 6.5 } }}>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mb: row.reason_note ? 0.75 : 0 }}>
                  <Chip
                    size="small"
                    label={reasonShortLabel(row.reason_code)}
                    sx={{
                      height: 22,
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      bgcolor: alpha(theme.palette.text.primary, 0.06),
                    }}
                  />
                  <SourceTag source={row.reason_source} />
                  <StateChip item={row} />
                </Stack>
                {row.reason_note && (
                  <Typography
                    sx={{
                      fontSize: '0.9rem',
                      fontStyle: 'italic',
                      color: 'text.primary',
                      borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.35)}`,
                      pl: 1.25,
                      py: 0.25,
                    }}
                  >
                    &ldquo;{row.reason_note}&rdquo;
                  </Typography>
                )}
              </Box>

              <Stack
                direction="row"
                spacing={0.75}
                sx={{ mt: 1.25, pl: { xs: 0, sm: 6.5 }, flexWrap: 'wrap', gap: 0.75, display: { xs: 'none', sm: 'flex' } }}
              >
                {row.student.phone && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={`tel:${row.student.phone}`}
                    startIcon={<PhoneOutlinedIcon />}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                  >
                    Call
                  </Button>
                )}
                {!row.caught_up_at && !row.excused && (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy === row.student.id}
                    onClick={() => onNudge(row.student.id, journeyFor(row.student.id))}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                  >
                    Nudge
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
          {rows.length > limit && (
            <Button
              variant="outlined"
              onClick={() => setLimit((n) => n + PAGE * 2)}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              Show more ({rows.length - limit} left)
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );
}
