'use client';

import { useEffect, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { Alert, Box, Typography } from '@neram/ui';
import { formatDemoTime } from '@neram/database/demo-schedule';
import { OpsSkeleton } from '@/components/ops/OpsUi';
import type { DemoHost } from './types';

export interface Availability {
  from: string;
  to: string;
  busy: Record<string, Array<{ start: string; end: string; status: string }>>;
  busyError: string | null;
  dryRun: boolean;
  demos: Array<{ id: string; name: string; ref: string | null; start: string; minutes: number; tutorUpn: string | null }>;
}

/** Busy blocks of `upn` that overlap the proposed slot. */
export function clashesFor(av: Availability | null, upn: string, start: Date | null, minutes: number) {
  if (!av || !start) return [];
  const s = start.getTime();
  const e = s + minutes * 60_000;
  return (av.busy[upn] ?? []).filter((b) => new Date(b.start).getTime() < e && new Date(b.end).getTime() > s);
}

const HOURS = [8, 10, 12, 14, 16, 18, 20, 22];

/**
 * One India day (8 AM to 10 PM) for the people on this demo: their Outlook
 * busy time, the demos already confirmed, and the proposed slot on top.
 */
export default function AvailabilityTimeline({
  date,
  team,
  people,
  start,
  minutes,
  excludeId,
  onLoaded,
}: {
  date: string;
  team: string[];
  people: DemoHost[];
  start: Date | null;
  minutes: number;
  excludeId?: string;
  onLoaded: (a: Availability | null) => void;
}) {
  const [av, setAv] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${date}|${team.join(',')}`;

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/demo-requests/availability?date=${date}&upns=${encodeURIComponent(team.join(','))}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not read calendars');
        return d as Availability;
      })
      .then((d) => {
        if (cancelled) return;
        setAv(d);
        onLoaded(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setAv(null);
        onLoaded(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (loading && !av) return <OpsSkeleton variant="rounded" height={120} />;
  if (error) return <Alert severity="warning">Calendars could not be read: {error}</Alert>;
  if (!av) return null;

  const t0 = new Date(av.from).getTime();
  const span = new Date(av.to).getTime() - t0;
  const pct = (iso: string | number) => Math.min(100, Math.max(0, ((new Date(iso).getTime() - t0) / span) * 100));
  const demos = av.demos.filter((d) => d.id !== excludeId);
  const rows = [
    ...team.map((upn) => ({
      key: upn,
      label: people.find((p) => p.upn === upn)?.name ?? upn,
      blocks: (av.busy[upn] ?? []).map((b) => ({ start: b.start, end: b.end, kind: b.status })),
    })),
    {
      key: '__demos',
      label: 'Demos',
      blocks: demos.map((d) => ({
        start: d.start,
        end: new Date(new Date(d.start).getTime() + d.minutes * 60_000).toISOString(),
        kind: 'demo',
      })),
    },
  ];
  const slot = start ? { left: pct(start.getTime()), width: (minutes * 60_000 / span) * 100 } : null;

  return (
    <Box>
      {av.dryRun && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Dry run: Outlook calendars are not read, so nobody shows as busy.
        </Typography>
      )}
      {av.busyError && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {av.busyError}
        </Alert>
      )}
      <Box aria-hidden sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', rowGap: 0.75, columnGap: 1, alignItems: 'center' }}>
        <Box />
        <Box sx={{ position: 'relative', height: 16 }}>
          {HOURS.map((h) => (
            <Typography
              key={h}
              variant="caption"
              color="text.secondary"
              sx={{ position: 'absolute', left: `${((h - 8) / 14) * 100}%`, transform: 'translateX(-50%)', fontSize: 11 }}
            >
              {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
            </Typography>
          ))}
        </Box>
        {rows.map((row) => (
          <Box key={row.key} sx={{ display: 'contents' }}>
            <Typography variant="body2" fontWeight={600} noWrap title={row.label}>
              {row.label}
            </Typography>
            <Box sx={{ position: 'relative', height: 22, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
              {row.blocks.map((b, i) => (
                <Box
                  key={i}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${pct(b.start)}%`,
                    width: `${Math.max(0.8, pct(b.end) - pct(b.start))}%`,
                    bgcolor: (t) =>
                      b.kind === 'demo'
                        ? t.palette.secondary.main
                        : b.kind === 'tentative'
                          ? alpha(t.palette.warning.main, 0.55)
                          : alpha(t.palette.text.primary, 0.45),
                  }}
                />
              ))}
              {slot && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${slot.left}%`,
                    width: `${slot.width}%`,
                    border: 2,
                    borderColor: 'primary.main',
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.15),
                    borderRadius: 0.5,
                  }}
                />
              )}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }} aria-hidden>
        {[
          { label: 'Busy in Outlook', sx: { bgcolor: (t: any) => alpha(t.palette.text.primary, 0.45) } },
          { label: 'Tentative', sx: { bgcolor: (t: any) => alpha(t.palette.warning.main, 0.55) } },
          { label: 'Another demo', sx: { bgcolor: 'secondary.main' } },
          { label: 'This demo', sx: { border: 2, borderColor: 'primary.main' } },
        ].map((l) => (
          <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 14, height: 10, borderRadius: 0.5, ...l.sx }} />
            <Typography variant="caption" color="text.secondary">
              {l.label}
            </Typography>
          </Box>
        ))}
      </Box>
      {/* The same information as text, for screen readers. */}
      <Box component="ul" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', m: 0, p: 0 }}>
        {rows.map((row) => (
          <li key={row.key}>
            {row.label}:{' '}
            {row.blocks.length
              ? row.blocks.map((b) => `${b.kind} ${formatDemoTime(new Date(b.start))} to ${formatDemoTime(new Date(b.end))}`).join(', ')
              : 'free all day'}
          </li>
        ))}
      </Box>
    </Box>
  );
}
