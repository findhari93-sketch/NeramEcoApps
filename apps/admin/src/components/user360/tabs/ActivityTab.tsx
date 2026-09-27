'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Skeleton, Typography } from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import {
  formatDateTime,
  relativeTime,
  sourceAppLabel,
  timelineDetailLine,
  timelineKindMeta,
  timelineTitle,
} from '@/lib/user360-view';
import { toneColors, type User360TabProps } from '../shared';
import { timelineIcon } from '../status-icons';

interface Entry {
  occurred_at: string;
  kind: string;
  title: string;
  detail: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name?: string | null;
  source_app: string | null;
}

const PAGE = 50;

function RowSkeleton() {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1.5, px: 2 }}>
      <Skeleton variant="circular" width={36} height={36} />
      <Box sx={{ flex: 1 }}>
        <Skeleton width="45%" />
        <Skeleton width="70%" />
      </Box>
    </Box>
  );
}

export default function ActivityTab({ userId }: User360TabProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const sentinel = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(
    async (before: string | null) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (before) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ limit: String(PAGE) });
        if (before) qs.set('before', before);
        const res = await fetch(`/api/users/${userId}/timeline?${qs.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not load the activity history.');
        setEntries((prev) => (before ? [...prev, ...(json.entries || [])] : json.entries || []));
        setNextBefore(json.nextBefore ?? null);
      } catch (e: any) {
        setError(e.message || 'Could not load the activity history.');
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !nextBefore || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) load(nextBefore);
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextBefore, load]);

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'grey.200' }}>
        <HistoryIcon sx={{ color: 'text.secondary' }} aria-hidden />
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          Activity, newest first
        </Typography>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => load(null)}
          disabled={loading}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert
          severity="error"
          role="alert"
          sx={{ m: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => load(entries.length ? nextBefore : null)} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Box aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </Box>
      ) : entries.length === 0 && !error ? (
        <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
          <HistoryIcon sx={{ fontSize: 40, color: 'text.disabled' }} aria-hidden />
          <Typography variant="body1" sx={{ mt: 1, fontWeight: 600 }}>
            No activity recorded yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign-ins, payments, calls, notes and changes will show here as they happen.
          </Typography>
        </Box>
      ) : (
        <Box component="ol" aria-label="Activity history" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {entries.map((e, i) => {
            const meta = timelineKindMeta(e.kind, e.title);
            const Icon = timelineIcon(e.kind);
            const c = toneColors(meta.tone);
            const line = timelineDetailLine(e.kind, e.detail);
            const app = sourceAppLabel(e.source_app);
            return (
              <Box
                component="li"
                key={`${e.occurred_at}-${e.kind}-${i}`}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'grey.100',
                  minWidth: 0,
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: c.bg,
                    color: c.fg,
                    border: '1px solid',
                    borderColor: c.border,
                  }}
                >
                  <Icon sx={{ fontSize: 19 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.25 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: c.fg, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {meta.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, wordBreak: 'break-word' }}>
                      {timelineTitle(e.kind, e.title)}
                    </Typography>
                  </Box>
                  {line && (
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                      {line}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" title={formatDateTime(e.occurred_at)}>
                      {formatDateTime(e.occurred_at)} ({relativeTime(e.occurred_at)})
                    </Typography>
                    {e.actor_id && (
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        by {e.actor_name || 'a staff member'}
                      </Typography>
                    )}
                    {app && <Chip label={app} size="small" variant="outlined" sx={{ height: 22, fontSize: 11.5 }} />}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {!loading && nextBefore && (
        <Box ref={sentinel} sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
          {loadingMore ? (
            <Box sx={{ width: '100%' }} aria-busy="true">
              <RowSkeleton />
            </Box>
          ) : (
            <Button variant="outlined" onClick={() => load(nextBefore)} sx={{ textTransform: 'none', minHeight: 44 }}>
              Load older activity
            </Button>
          )}
        </Box>
      )}
      {!loading && !nextBefore && entries.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 2 }}>
          That is everything on record.
        </Typography>
      )}
    </Paper>
  );
}
