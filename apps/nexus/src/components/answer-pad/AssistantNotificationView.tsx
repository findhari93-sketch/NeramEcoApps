'use client';

/**
 * One Neram Assistant notification, shown in full inside Teams, and the list of
 * recent ones the Assistant's tab opens on.
 *
 * A Teams Activity click lands here on the notification it was about (the deep
 * link's subEntityId). The Nexus page itself cannot render inside Teams, so this
 * view carries the whole message, for the catch-up digest every student and
 * what they said, and one "Open in Nexus" button to the exact page.
 */

import { useCallback, useEffect, useState } from 'react';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { Box, Button, Chip, Skeleton, Stack, Typography } from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';

export type TokenGetter = () => Promise<string>;

export interface DigestItem {
  kind: 'reason' | 'completed';
  /** Older rows carry no id or photo; the face falls back to initials. */
  studentId?: string;
  studentName: string;
  studentPhoto?: string | null;
  classTitle: string;
  scheduledDate: string;
  reasonLabel: string | null;
  reasonNote: string | null;
}

export interface NotificationDetail {
  id: string;
  event_type: string;
  title: string;
  message: string;
  created_at: string;
  items: DigestItem[];
  more: number;
  href: string | null;
}

export interface NotificationSummary {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

const IST = 'Asia/Kolkata';

/** "7 Oct, 9:05 am", in IST like the rest of Nexus. */
export function sentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "6 Oct" for a class date, read in IST so an evening class keeps its own day. */
export function classDay(ymd: string): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short' });
}

async function getJson<T>(path: string, getToken: TokenGetter): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

const focusRing = { '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: '2px' } };

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button
      onClick={onBack}
      startIcon={<ArrowBackRounded aria-hidden />}
      sx={{ alignSelf: 'flex-start', minHeight: 48, px: 1, ml: -1, textTransform: 'none', fontWeight: 700, ...focusRing }}
    >
      All notifications
    </Button>
  );
}

function OpenInNexus({ href }: { href: string }) {
  return (
    <Button
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant="contained"
      size="large"
      fullWidth
      endIcon={<OpenInNewRounded aria-hidden />}
      aria-label="Open in Nexus, opens in your browser"
      sx={{ minHeight: 48, fontWeight: 700, textTransform: 'none', touchAction: 'manipulation', ...focusRing }}
    >
      Open in Nexus
    </Button>
  );
}

function DigestSection({ heading, items }: { heading: string; items: DigestItem[] }) {
  if (!items.length) return null;
  return (
    <Box component="section" aria-label={heading}>
      <Typography component="h2" variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
        {heading} ({items.length})
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {items.map((item, i) => (
          <Box
            component="li"
            key={`${item.studentName}-${item.scheduledDate}-${i}`}
            sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <StudentAvatar
                userId={item.studentId ?? null}
                name={item.studentName}
                src={item.studentPhoto ?? null}
                size={40}
                snapshot={false}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                  {item.studentName}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {item.classTitle}, {classDay(item.scheduledDate)}
                </Typography>
              </Box>
              {item.reasonLabel && <Chip label={item.reasonLabel} size="small" variant="outlined" sx={{ flexShrink: 0 }} />}
            </Stack>
            {item.reasonNote && (
              <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                &ldquo;{item.reasonNote}&rdquo;
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function DetailSkeleton() {
  return (
    <Stack spacing={1.5} aria-busy="true" aria-label="Loading the notification">
      <Skeleton variant="text" width="70%" height={36} />
      <Skeleton variant="text" width="35%" />
      <Skeleton variant="rounded" height={64} />
      <Skeleton variant="rounded" height={48} />
      <Skeleton variant="rounded" height={72} />
    </Stack>
  );
}

export function AssistantNotificationView({
  id,
  getToken,
  onBack,
}: {
  id: string;
  getToken: TokenGetter;
  onBack: () => void;
}) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; data: NotificationDetail } | { status: 'error' }>({
    status: 'loading',
  });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getJson<NotificationDetail>(`/api/notifications/${encodeURIComponent(id)}`, getToken)
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [id, getToken]);

  if (state.status === 'loading') {
    return (
      <Stack spacing={2}>
        <BackButton onBack={onBack} />
        <DetailSkeleton />
      </Stack>
    );
  }

  if (state.status === 'error') {
    return (
      <Stack spacing={2}>
        <BackButton onBack={onBack} />
        <Typography role="alert">Could not load this notification. It may have been removed, or it was sent to someone else.</Typography>
      </Stack>
    );
  }

  const { data } = state;
  const reasons = data.items.filter((i) => i.kind === 'reason');
  const completed = data.items.filter((i) => i.kind === 'completed');

  return (
    <Stack spacing={2.5} component="article" aria-labelledby="assistant-notification-title">
      <BackButton onBack={onBack} />
      <Box>
        <Typography id="assistant-notification-title" variant="h5" component="h1" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
          {data.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {sentAt(data.created_at)}
        </Typography>
      </Box>
      <Typography sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{data.message}</Typography>
      {data.href && <OpenInNexus href={data.href} />}
      <DigestSection heading="Explained why they missed" items={reasons} />
      <DigestSection heading="Finished their catch-up" items={completed} />
      {data.more > 0 && (
        <Typography variant="body2" color="text.secondary">
          And {data.more} more. Open Nexus to see everyone.
        </Typography>
      )}
    </Stack>
  );
}

export function AssistantRecentList({ getToken, onOpen }: { getToken: TokenGetter; onOpen: (id: string) => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; rows: NotificationSummary[] } | { status: 'error' }>({
    status: 'loading',
  });

  const load = useCallback(() => {
    let active = true;
    setState({ status: 'loading' });
    getJson<{ notifications?: NotificationSummary[] }>('/api/notifications?limit=10', getToken)
      .then((data) => active && setState({ status: 'ready', rows: data.notifications || [] }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [getToken]);

  useEffect(() => load(), [load]);

  return (
    <Box component="section" aria-labelledby="assistant-recent-heading">
      <Typography id="assistant-recent-heading" component="h2" variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
        Recent notifications
      </Typography>

      {state.status === 'loading' && (
        <Stack spacing={1} aria-busy="true" aria-label="Loading notifications">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} />
          ))}
        </Stack>
      )}

      {state.status === 'error' && (
        <Stack spacing={1} alignItems="flex-start">
          <Typography role="alert" color="text.secondary">
            Could not load your notifications.
          </Typography>
          <Button onClick={load} sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, ...focusRing }}>
            Try again
          </Button>
        </Stack>
      )}

      {state.status === 'ready' && state.rows.length === 0 && (
        <Typography color="text.secondary">Nothing yet. Messages from Neram Assistant will show here.</Typography>
      )}

      {state.status === 'ready' && state.rows.length > 0 && (
        <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {state.rows.map((row) => (
            <li key={row.id}>
              <Box
                component="button"
                type="button"
                onClick={() => onOpen(row.id)}
                aria-label={`${row.is_read ? '' : 'New. '}${row.title}, ${sentAt(row.created_at)}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  width: '100%',
                  minHeight: 64,
                  px: 2,
                  py: 1.25,
                  textAlign: 'left',
                  font: 'inherit',
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  color: 'text.primary',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  ...focusRing,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {!row.is_read && (
                      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                    )}
                    <Typography fontWeight={row.is_read ? 600 : 800} noWrap>
                      {row.title}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {row.message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sentAt(row.created_at)}
                  </Typography>
                </Box>
                <ChevronRightRounded aria-hidden sx={{ color: 'text.secondary', flexShrink: 0 }} />
              </Box>
            </li>
          ))}
        </Stack>
      )}
    </Box>
  );
}
