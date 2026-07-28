'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Skeleton,
  Alert,
  Stack,
  Chip,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AttendanceStrip from '@/components/parent/AttendanceStrip';

/**
 * The parent's Classes tab: what is coming up, and what happened.
 *
 * Reads /api/parent/timetable, NOT the shared /api/timetable. That matters for
 * more than tidiness: the shared route takes its scope from a `?classroom=`
 * query parameter and authorises by enrollment, which a parent can never hold.
 * The parent route resolves the classroom from the parent-child link server
 * side, so a parent cannot ask for a classroom that is not their child's.
 *
 * Every past class renders through AttendanceStrip, which draws "not recorded"
 * for a class that was never synced instead of showing it as an absence.
 */

type StripProps = React.ComponentProps<typeof AttendanceStrip>;

interface TimetableResponse {
  child: { id: string; name: string | null; classroom_name: string | null };
  windowDays: number;
  upcoming: Array<{
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
  }>;
  recent: Array<StripProps & { classId: string }>;
  summary: {
    measuredClasses: number;
    notMeasuredClasses: number;
    attended: number;
    missed: number;
    late: number;
    droppedMidClass: number;
    attendanceRate: number | null;
  };
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

function clock(time: string, date: string): string {
  const ms = Date.parse(`${date}T${time}+05:30`);
  if (!Number.isFinite(ms)) return time;
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

export default function ParentTimetablePage() {
  const { getToken } = useNexusAuthContext();

  const [data, setData] = useState<TimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/parent/timetable', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the timetable.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the timetable.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={110} />
        <Skeleton variant="rounded" height={110} />
      </Stack>
    );
  }

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return null;

  const { summary } = data;

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 700, fontSize: 20 }}>Classes</Typography>

      {/* Coming up */}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1.5 }}>
            Coming up
          </Typography>
          {data.upcoming.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 15 }}>
              No classes scheduled yet.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {data.upcoming.map((c) => (
                <Box
                  key={c.id}
                  sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>
                      {c.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
                      {clock(c.start_time, c.scheduled_date)} to{' '}
                      {clock(c.end_time, c.scheduled_date)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={friendlyDate(c.scheduled_date)}
                    sx={{ flexShrink: 0, alignSelf: 'flex-start' }}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Past classes */}
      <Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1.5,
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
            Past {data.windowDays} days
          </Typography>
          {summary.measuredClasses > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
              Attended {summary.attended} of {summary.measuredClasses}
            </Typography>
          )}
        </Box>

        {summary.notMeasuredClasses > 0 && (
          <Alert severity="info" sx={{ mb: 1.5, fontSize: 14 }}>
            {summary.notMeasuredClasses}{' '}
            {summary.notMeasuredClasses === 1 ? 'class has' : 'classes have'} no
            attendance recorded. Those are not counted above.
          </Alert>
        )}

        {data.recent.length === 0 ? (
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 15 }}>
                No classes have happened in this period yet.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {data.recent.map((c) => (
              <AttendanceStrip key={c.classId} {...c} />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
