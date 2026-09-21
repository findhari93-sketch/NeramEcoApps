'use client';

import { useMemo, useState } from 'react';
import { Box, Collapse, Typography, alpha, useTheme } from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import { coveringWindow, describeWindow } from '@/lib/away-windows';
import { describeReason } from '@/lib/rsvp-reasons';
import {
  availableLabel,
  forecastVerdict,
  likelyLabel,
  reasonSummaryLabel,
  turnoutVerdict,
} from '@/lib/class-availability';
import type { DayForecast } from '@/lib/class-forecast';
import type { RsvpDashboardRangeResponse } from '@/app/api/timetable/rsvp-dashboard/route';
import { REDUCED_MOTION_QUERY } from './timetable-theme';
import TurnoutChip from './TurnoutChip';

/**
 * Who is free on the date the teacher just picked, inside the Add Class form.
 *
 * This form used to decide blind. A class could be scheduled, and a Teams
 * meeting created for it, onto a night nine students had already declared
 * themselves away for, and the first anyone knew was the empty room. The page
 * has held the answer the whole time; it simply never reached here.
 *
 * Reads the page's existing per-date rows, so it issues NO request. It renders
 * nothing at all when the chosen date falls outside the loaded range: a line
 * that silently means "not fetched" is worse than no line, because the shape it
 * would take is "nobody is away".
 */
export default function DateAvailabilityNote({
  date,
  availability,
  forecast,
}: {
  date: string;
  availability?: RsvpDashboardRangeResponse;
  /**
   * The realistic headcount for this date, when it is known.
   *
   * Without it this line would quote the entitled count while the calendar cell
   * the teacher just came from quotes the realistic one, and two different
   * numbers for the same night is worse than either on its own.
   */
  forecast?: DayForecast | null;
}) {
  const theme = useTheme();
  const [showWho, setShowWho] = useState(false);

  const day = useMemo(
    () => availability?.days.find((d) => d.date === date),
    [availability, date],
  );
  const awayById = useMemo(
    () => new Map((availability?.away_students || []).map((s) => [s.id, s] as const)),
    [availability],
  );

  if (!date || !day) return null;

  const verdict = forecast
    ? forecastVerdict(forecast.likely, forecast.onRoll)
    : turnoutVerdict(day.summary);
  const reasons = reasonSummaryLabel(day.away_tally);
  const hasClass = day.class_ids.length > 0;

  return (
    <Box
      sx={{
        mt: -1,
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        bgcolor: alpha(
          verdict.key === 'good' ? theme.palette.success.main : theme.palette.warning.main,
          0.08,
        ),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <TurnoutChip verdict={verdict} />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {forecast ? `${likelyLabel(forecast)} available` : availableLabel(day.summary)}
        </Typography>
      </Box>

      {day.summary.away > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {day.summary.away} away{reasons ? `: ${reasons}` : ''}
        </Typography>
      )}

      {!!forecast?.atRisk && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {forecast.atRisk} rarely come, no reason given
        </Typography>
      )}

      {hasClass && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          There is already a class on this date.
        </Typography>
      )}

      {day.away_ids.length > 0 && (
        <>
          <Box
            component="button"
            type="button"
            onClick={() => setShowWho((v) => !v)}
            aria-expanded={showWho}
            aria-controls="add-class-away-who"
            sx={{
              minHeight: 44,
              mt: 0.25,
              px: 0,
              border: 0,
              bgcolor: 'transparent',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.75rem',
              color: 'primary.main',
              cursor: 'pointer',
              textAlign: 'left',
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            {showWho ? 'Hide' : 'See who'}
          </Box>
          <Collapse
            in={showWho}
            unmountOnExit
            sx={{ [REDUCED_MOTION_QUERY]: { transition: 'none' } }}
          >
            <Box id="add-class-away-who">
              {day.away_ids.map((id) => {
                const s = awayById.get(id);
                if (!s) return null;
                const w = coveringWindow(s.windows, date) || s.windows[0];
                return (
                  <Box
                    key={id}
                    sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minHeight: 44, py: 0.25 }}
                  >
                    {/* At or above MIN_GLYPH_SIZE, or the info ring draws a
                        coloured circle with no exam year and no language mark.
                        Same silent failure the day sheet had at 26. */}
                    <StudentAvatar userId={id} src={s.avatar_url} name={s.name} size={28} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                        {s.name}
                      </Typography>
                      {w && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', overflowWrap: 'anywhere' }}
                        >
                          {describeWindow(w, date)}: {describeReason(w.reason_code, w.reason_note)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
}
