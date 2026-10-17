'use client';

/**
 * Left pane of Conversations: search, All / Signed in / Guests, status chips,
 * and chats grouped by day. Up and Down move the selection.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Box, Button, Chip, CircularProgress, InputAdornment, TextField, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import { FOCUS_RING, OpsSkeleton } from '@/components/ops/OpsUi';
import type { InboxConversation } from '@/lib/aintra-inbox/types';
import { chatbotLabel, fmtDate, fmtTime, PersonAvatar, sourceLabelOf, StatusPill } from './ui';

export type Segment = 'all' | 'user' | 'guest';
export type StatusFilter = 'all' | 'queue' | 'review' | 'error' | 'none';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'user', label: 'Signed in' },
  { key: 'guest', label: 'Guests' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function bucketLabel(bucket: string, now: Date): string {
  if (bucket === 'today') return `Today · ${fmtDate(now.toISOString())}`;
  if (bucket === 'yesterday') return `Yesterday · ${fmtDate(new Date(now.getTime() - 86400000).toISOString())}`;
  if (bucket === 'week') return 'Earlier this week';
  const [y, m] = bucket.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function matchesSegment(c: { isGuest: boolean }, seg: Segment) {
  return seg === 'all' || (seg === 'user' ? !c.isGuest : c.isGuest);
}

export function matchesStatus(c: InboxConversation, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'queue') return c.reviewCount + c.errorCount > 0;
  if (filter === 'review') return c.reviewCount > 0;
  if (filter === 'error') return c.errorCount > 0;
  return c.status === 'none';
}

export function matchesQuery(c: InboxConversation, q: string) {
  if (!q) return true;
  const hay = [c.name, c.guestTag, c.phone, c.place, ...c.questions].filter(Boolean).join(' ').toLowerCase();
  const digits = q.replace(/\D/g, '');
  return hay.includes(q) || (digits.length >= 4 && (c.phone ?? '').replace(/\D/g, '').includes(digits));
}

export default function ConversationList({
  loading,
  conversations,
  segment,
  onSegment,
  status,
  onStatus,
  query,
  onQuery,
  selectedId,
  onSelect,
  now,
  onResolveCredits,
}: {
  loading: boolean;
  conversations: InboxConversation[];
  segment: Segment;
  onSegment: (s: Segment) => void;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: Date;
  /** "Resolve all credits ran out". Resolves every such question, in every segment. */
  onResolveCredits?: () => Promise<void>;
}) {
  const q = query.trim().toLowerCase();
  const listRef = useRef<HTMLDivElement>(null);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [resolving, setResolving] = useState(false);
  const allCredits = useMemo(() => conversations.reduce((n, c) => n + c.creditErrorCount, 0), [conversations]);

  const resolveAll = async () => {
    if (!onResolveCredits) return;
    setResolving(true);
    try {
      await onResolveCredits();
      setConfirmResolve(false);
    } finally {
      setResolving(false);
    }
  };

  const segCounts = useMemo(() => {
    const base = conversations.filter((c) => matchesStatus(c, status) && matchesQuery(c, q));
    return {
      all: base.length,
      user: base.filter((c) => !c.isGuest).length,
      guest: base.filter((c) => c.isGuest).length,
    };
  }, [conversations, status, q]);

  const statusCounts = useMemo(() => {
    const base = conversations.filter((c) => matchesSegment(c, segment));
    return {
      queue: base.filter((c) => c.reviewCount + c.errorCount > 0).length,
      review: base.filter((c) => c.reviewCount > 0).length,
      error: base.filter((c) => c.errorCount > 0).length,
      credits: base.reduce((n, c) => n + c.creditErrorCount, 0),
    };
  }, [conversations, segment]);

  const visible = useMemo(
    () => conversations.filter((c) => matchesSegment(c, segment) && matchesStatus(c, status) && matchesQuery(c, q)),
    [conversations, segment, status, q]
  );

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: InboxConversation[] }[] = [];
    for (const c of visible) {
      const last = out[out.length - 1];
      if (last && last.key === c.bucket) last.items.push(c);
      else out.push({ key: c.bucket, label: bucketLabel(c.bucket, now), items: [c] });
    }
    return out;
  }, [visible, now]);

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Everything' },
    { key: 'queue', label: `Review queue · ${statusCounts.queue}` },
    { key: 'review', label: `Needs review · ${statusCounts.review}` },
    { key: 'error', label: statusCounts.credits ? `Credits ran out · ${statusCounts.error}` : `No answer · ${statusCounts.error}` },
    { key: 'none', label: 'Not reviewed' },
  ];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (!visible.length) return;
    e.preventDefault();
    const i = visible.findIndex((c) => c.id === selectedId);
    const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    onSelect(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-conv="${CSS.escape(next.id)}"]`)?.focus();
  };

  return (
    <Box
      component="section"
      aria-label="Conversations"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: 1.75, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search questions, names, phone…"
          inputProps={{ 'aria-label': 'Search conversations' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="primary" />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
        />

        <Box role="radiogroup" aria-label="Who" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.5, bgcolor: 'grey.100', borderRadius: 2.5, p: 0.5 }}>
          {SEGMENTS.map((s) => {
            const on = segment === s.key;
            return (
              <Box
                key={s.key}
                component="button"
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSegment(s.key)}
                sx={{
                  ...FOCUS_RING,
                  all: 'unset',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  minHeight: 44,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  bgcolor: on ? 'background.paper' : 'transparent',
                  color: on ? 'primary.main' : 'text.secondary',
                  boxShadow: on ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
                  transition: 'background-color 150ms, color 150ms',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Typography component="span" sx={{ fontSize: 12 }}>
                  {s.label}
                </Typography>
                <Typography component="span" sx={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '·' : segCounts[s.key]}
                </Typography>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="Status">
          {filters.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              clickable
              variant={status === f.key ? 'filled' : 'outlined'}
              color={status === f.key ? 'primary' : 'default'}
              onClick={() => onStatus(f.key)}
              aria-pressed={status === f.key}
              sx={{ height: 32, fontWeight: 500 }}
            />
          ))}
        </Box>

        {status === 'error' && allCredits > 0 && onResolveCredits && !loading && (
          <Box
            role="region"
            aria-label="Resolve credits ran out"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 1.5,
              borderRadius: 2,
              border: 1,
              borderColor: (t) => alpha(t.palette.warning.main, 0.45),
              bgcolor: (t) => alpha(t.palette.warning.main, 0.08),
            }}
          >
            <Typography sx={{ fontSize: 13, color: 'text.primary', lineHeight: 1.5 }}>
              {confirmResolve
                ? `Mark all ${allCredits} as resolved? They leave the Review queue. You can still open each one and write an answer.`
                : `${allCredits} ${allCredits === 1 ? 'question' : 'questions'} got no answer while AI credits were out. If credits are back, resolve them in one go.`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              {confirmResolve ? (
                <>
                  <Button size="small" onClick={() => setConfirmResolve(false)} disabled={resolving} sx={{ minHeight: 44 }}>
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={resolveAll}
                    disabled={resolving}
                    startIcon={resolving ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ minHeight: 44 }}
                  >
                    Resolve {allCredits}
                  </Button>
                </>
              ) : (
                <Button size="small" variant="outlined" onClick={() => setConfirmResolve(true)} sx={{ minHeight: 44 }}>
                  Resolve all
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Box ref={listRef} onKeyDown={onKeyDown} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading &&
          Array.from({ length: 6 }, (_, i) => (
            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 1.5, p: 2, borderBottom: 1, borderColor: 'grey.100' }}>
              <OpsSkeleton variant="circular" width={36} height={36} />
              <Box>
                <OpsSkeleton width="50%" />
                <OpsSkeleton width="90%" />
                <OpsSkeleton width="70%" />
              </Box>
            </Box>
          ))}

        {!loading &&
          groups.map((g) => (
            <Box key={g.key} component="section" aria-label={g.label}>
              <Box
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  bgcolor: 'grey.50',
                  px: 2,
                  py: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'text.secondary',
                  borderBottom: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{g.label}</span>
                <span>{g.items.length}</span>
              </Box>
              {g.items.map((c) => {
                const sel = c.id === selectedId;
                const showStatus = c.status === 'review' || c.status === 'error' || c.status === 'corrected' || c.status === 'resolved';
                const meta = [c.place, c.channel ? sourceLabelOf(c.channel) : chatbotLabel(c.source), c.turnCount > 1 ? `${c.turnCount} questions` : null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Box
                    key={c.id}
                    data-conv={c.id}
                    component="button"
                    type="button"
                    aria-current={sel ? 'true' : undefined}
                    onClick={() => onSelect(c.id)}
                    sx={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      width: '100%',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '36px minmax(0,1fr) auto',
                      gap: 1.5,
                      px: 2,
                      py: 1.5,
                      borderBottom: 1,
                      borderColor: 'grey.100',
                      bgcolor: sel ? 'action.selected' : 'transparent',
                      boxShadow: (t) => `inset 3px 0 0 ${sel ? t.palette.primary.main : 'transparent'}`,
                      transition: 'background-color 150ms',
                      '&:hover': { bgcolor: sel ? 'action.selected' : 'action.hover' },
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                    }}
                  >
                    <PersonAvatar isGuest={c.isGuest} initials={c.initials} src={c.avatarUrl} enrolled={c.enrolled} />
                    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline', minWidth: 0 }}>
                        <Typography
                          component="span"
                          noWrap
                          sx={{ fontSize: 14, fontWeight: c.isGuest ? 400 : 600, color: c.isGuest ? 'text.secondary' : 'text.primary' }}
                        >
                          {c.name}
                        </Typography>
                        {c.guestTag && (
                          <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            {c.guestTag}
                          </Typography>
                        )}
                      </Box>
                      <Typography component="span" noWrap sx={{ fontSize: 13, color: 'text.primary' }}>
                        {c.lastQuestion}
                      </Typography>
                      <Typography component="span" noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {meta}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75 }}>
                      <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {c.bucket === 'today' || c.bucket === 'yesterday' ? fmtTime(c.lastAt) : fmtDate(c.lastAt)}
                      </Typography>
                      {showStatus && <StatusPill status={c.status} credits={c.creditErrorCount > 0} />}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ))}

        {!loading && !groups.length && (
          <Typography sx={{ p: 3, fontSize: 13, color: 'text.secondary' }}>No conversations match these filters.</Typography>
        )}
      </Box>
    </Box>
  );
}
