'use client';

import { Box, Typography, Chip, Tooltip, alpha, useTheme } from '@neram/ui';

/**
 * One class rendered as a presence timeline.
 *
 * The design brief this exists to satisfy: a parent asked for "exactly when he
 * dropped off". That data is real (Teams join/leave intervals), and it is also
 * the single most weaponisable thing in the portal. Rendered as a table of
 * timestamps it reads as a charge sheet. Rendered as a bar it reads as
 * information, and the parent can see at a glance that 73 of 90 minutes is
 * mostly fine.
 *
 * A class with measurement 'not_measured' renders grey and flat with no times
 * at all, because we genuinely do not know. It must NEVER render as an absence.
 */

export interface AttendanceStripSegment {
  joinedAt: string | null;
  leftAt: string | null;
  durationMinutes: number | null;
}

export interface AttendanceStripProps {
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  scheduledMinutes: number | null;
  measurement: 'measured' | 'not_measured';
  label: string;
  attended: boolean | null;
  durationMinutes: number | null;
  segments: AttendanceStripSegment[];
  reasonNote?: string | null;
}

/** 'HH:MM:SS' or an ISO timestamp to a friendly IST clock time. */
function clock(value: string | null, fallbackDate?: string): string {
  if (!value) return '';
  const iso = value.includes('T')
    ? value
    : `${fallbackDate || '2000-01-01'}T${value}+05:30`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

function friendlyDate(ymd: string): string {
  const ms = Date.parse(`${ymd}T00:00:00+05:30`);
  if (!Number.isFinite(ms)) return ymd;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

const LABEL_COLOUR: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  Attended: 'success',
  'Joined late': 'warning',
  'Left early': 'warning',
  'Partly attended': 'warning',
  Missed: 'error',
  'Missed (reason given)': 'info',
  'Not recorded': 'default',
};

export default function AttendanceStrip(props: AttendanceStripProps) {
  const theme = useTheme();
  const unmeasured = props.measurement === 'not_measured';

  const startMs = Date.parse(`${props.date}T${props.startTime}+05:30`);
  const endMs = Date.parse(`${props.date}T${props.endTime}+05:30`);
  const span = endMs - startMs;

  // Clamp each present stretch into the scheduled window so a stray timestamp
  // cannot draw a bar off the end of the card.
  const bars =
    unmeasured || !Number.isFinite(span) || span <= 0
      ? []
      : props.segments
          .map((seg) => {
            const from = seg.joinedAt ? Date.parse(seg.joinedAt) : NaN;
            const to = seg.leftAt ? Date.parse(seg.leftAt) : NaN;
            if (!Number.isFinite(from)) return null;
            const safeTo = Number.isFinite(to) ? to : endMs;
            const left = Math.max(0, Math.min(1, (from - startMs) / span));
            const right = Math.max(0, Math.min(1, (safeTo - startMs) / span));
            if (right <= left) return null;
            return { left: left * 100, width: (right - left) * 100, seg };
          })
          .filter((b): b is NonNullable<typeof b> => b !== null);

  // Attended with no interval detail: show one solid bar rather than an empty
  // track, which would read as "was not there".
  const showSolid = !unmeasured && props.attended && bars.length === 0;

  return (
    <Box
      sx={{
        py: 2,
        px: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: unmeasured ? alpha(theme.palette.text.disabled, 0.04) : 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 1,
          mb: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 16, lineHeight: 1.3 }} noWrap>
            {props.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
            {friendlyDate(props.date)} · {clock(props.startTime, props.date)} to{' '}
            {clock(props.endTime, props.date)}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={props.label}
          color={LABEL_COLOUR[props.label] ?? 'default'}
          variant={unmeasured ? 'outlined' : 'filled'}
          sx={{ flexShrink: 0, fontWeight: 600 }}
        />
      </Box>

      {/* The track. Solid means present, empty gap means away. */}
      <Box
        sx={{
          position: 'relative',
          height: 10,
          borderRadius: 5,
          bgcolor: alpha(theme.palette.text.disabled, unmeasured ? 0.12 : 0.18),
          overflow: 'hidden',
        }}
      >
        {showSolid && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: 5,
              bgcolor: 'success.main',
            }}
          />
        )}
        {bars.map((bar, i) => (
          <Tooltip
            key={i}
            title={`${clock(bar.seg.joinedAt)} to ${clock(bar.seg.leftAt)}`}
            enterTouchDelay={0}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${bar.left}%`,
                width: `${bar.width}%`,
                borderRadius: 5,
                bgcolor: 'success.main',
              }}
            />
          </Tooltip>
        ))}
      </Box>

      <Box sx={{ mt: 1.25 }}>
        {unmeasured ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
            Attendance was not recorded for this class.
          </Typography>
        ) : (
          <>
            {bars.length > 1 && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
                {bars
                  .map((b) => `${clock(b.seg.joinedAt)} to ${clock(b.seg.leftAt)}`)
                  .join(', rejoined ')}
              </Typography>
            )}
            {typeof props.durationMinutes === 'number' && props.scheduledMinutes ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
                Present {props.durationMinutes} of {props.scheduledMinutes} minutes
              </Typography>
            ) : null}
            {props.reasonNote ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14, mt: 0.5 }}>
                Reason given: {props.reasonNote}
              </Typography>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  );
}
