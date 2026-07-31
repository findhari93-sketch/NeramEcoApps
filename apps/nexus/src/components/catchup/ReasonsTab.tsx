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
import { Alert, Box, Button, Chip, Stack, Typography, alpha, useTheme } from '@neram/ui';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
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

export default function ReasonsTab({ data, busy, onNudge }: TabProps) {
  const theme = useTheme();
  const [filter, setFilter] = useState<string | null>(null);

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
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.75, rowGap: 0.75 }}
      >
        <Chip
          label={`All ${data.reasons.length}`}
          onClick={() => setFilter(null)}
          color={filter === null ? 'primary' : 'default'}
          variant={filter === null ? 'filled' : 'outlined'}
          sx={{ fontWeight: 700, height: 34 }}
        />
        {RSVP_REASONS.map((r) => {
          const n = data.reasonTally?.[r.code] ?? 0;
          if (n === 0) return null;
          const on = filter === r.code;
          return (
            <Chip
              key={r.code}
              label={`${r.shortLabel} ${n}`}
              onClick={() => setFilter(on ? null : r.code)}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700, height: 34 }}
            />
          );
        })}
      </Stack>

      {rows.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No reasons in that category.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {rows.map((row: FeedRow) => (
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
                    </Typography>
                  }
                />
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ whiteSpace: 'nowrap', pt: 0.25 }}
                >
                  {timeAgo(row.reason_submitted_at)}
                </Typography>
              </Stack>

              {/* The reason itself. The category is a tag; the quote is what they
                  actually typed, and it is the only thing on this screen that is
                  in the student's own voice. */}
              <Box sx={{ mt: 1.25, pl: { xs: 0, sm: 6.5 } }}>
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
                sx={{ mt: 1.25, pl: { xs: 0, sm: 6.5 }, flexWrap: 'wrap', gap: 0.75 }}
              >
                {row.student.phone && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={`tel:${row.student.phone}`}
                    startIcon={<PhoneOutlinedIcon />}
                    sx={{ minHeight: 40, textTransform: 'none' }}
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
                    sx={{ minHeight: 40, textTransform: 'none' }}
                  >
                    Nudge
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
