'use client';

/**
 * AI Tutor packs, for staff to check before (or while) students are taught
 * from them.
 *
 * Flat, forms-style: three filters (Draft, Verified, Reviewed), one card per
 * pack. A draft shows why it failed its checks; every pack opens to a preview
 * of its steps, hints and final answer. Approve marks a verified pack
 * reviewed; Retire takes any pack out of service.
 *
 * Plain fetch, not the SWR device cache: a pack carries the worked answer.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Collapse, Pagination, Paper, Skeleton, Snackbar, Typography } from '@neram/ui';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import PageHeader from '@/components/PageHeader';
import MathText from '@/components/common/MathText';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { TutorPack } from '@/lib/assistant/tutor/pack';
import type { TutorPackRow } from '@/app/api/question-bank/tutor-packs/route';

type Status = 'draft' | 'verified' | 'reviewed';

const FILTERS: { value: Status; label: string; empty: string }[] = [
  { value: 'draft', label: 'Draft', empty: 'No drafts. Every generated pack passed its checks.' },
  { value: 'verified', label: 'Verified', empty: 'Nothing waiting for review.' },
  { value: 'reviewed', label: 'Reviewed', empty: 'No pack has been reviewed yet.' },
];

const PAGE_SIZE = 20;
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function TutorPacksPage() {
  const { getToken } = useNexusAuthContext();
  const [status, setStatus] = useState<Status>('verified');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TutorPackRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/question-bank/tutor-packs?status=${status}&page=${page}&page_size=${PAGE_SIZE}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'The tutor packs did not load.');
        if (!alive) return;
        setRows(body.data ?? []);
        setTotal(body.total ?? 0);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'The tutor packs did not load.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [getToken, status, page, reloadKey]);

  const act = useCallback(
    async (row: TutorPackRow, next: 'reviewed' | 'retired') => {
      setBusy(row.id);
      try {
        const token = await getToken();
        const res = await fetch(`/api/question-bank/tutor-packs/${row.id}`, {
          method: 'PATCH',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'That did not save.');
        // It leaves this filter either way (approve moves it to Reviewed; retire hides it).
        setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
        setTotal((t) => Math.max(0, t - 1));
        setToast(next === 'reviewed' ? 'Approved. It now shows under Reviewed.' : 'Retired. Students are no longer taught from it.');
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'That did not save.');
      } finally {
        setBusy(null);
      }
    },
    [getToken],
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const empty = FILTERS.find((f) => f.value === status)?.empty;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Tutor packs"
        subtitle="The step-by-step lessons the AI Tutor teaches maths questions from"
        backHref="/teacher/question-bank"
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }, { label: 'Tutor packs' }]}
      />

      <Box role="group" aria-label="Show packs" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {FILTERS.map((f) => {
          const on = status === f.value;
          return (
            <Chip
              key={f.value}
              label={on && rows ? `${f.label} (${total})` : f.label}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              aria-pressed={on}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              sx={{ height: 44, borderRadius: 22, px: 0.5, fontWeight: 600, cursor: 'pointer' }}
            />
          );
        })}
      </Box>

      {error ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => setReloadKey((k) => k + 1)} sx={{ minHeight: 44, textTransform: 'none' }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      ) : !rows ? (
        <Box sx={{ display: 'grid', gap: 1.5 }} role="status" aria-label="Loading tutor packs">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={112} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <InboxOutlinedIcon aria-hidden sx={{ fontSize: 40, color: 'text.secondary' }} />
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {empty}
          </Typography>
        </Paper>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {rows.map((row) => (
            <Box component="li" key={row.id}>
              <PackCard row={row} busy={busy === row.id} onApprove={() => void act(row, 'reviewed')} onRetire={() => void act(row, 'retired')} />
            </Box>
          ))}
        </Box>
      )}

      {pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
        </Box>
      )}

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}

function PackCard({ row, busy, onApprove, onRetire }: { row: TutorPackRow; busy: boolean; onApprove: () => void; onRetire: () => void }) {
  const [open, setOpen] = useState(false);
  const errors = row.verify_report?.errors ?? [];
  const warnings = row.verify_report?.warnings ?? [];
  const pack = row.pack as Partial<TutorPack> | null;
  const previewId = `pack-preview-${row.id}`;
  const updated = (() => {
    const d = new Date(row.updated_at);
    return Number.isNaN(d.getTime()) ? null : DATE.format(d);
  })();

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" component="p">
            {[row.question?.paper, row.question?.format, `v${row.version}`, row.model || row.generator, updated ? `updated ${updated}` : null]
              .filter(Boolean)
              .join(', ')}
          </Typography>
          <MathText
            text={row.question?.text || 'Question text not found'}
            variant="body1"
            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'anywhere' }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          {row.status === 'verified' && (
            <Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={onApprove} disabled={busy} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              Approve
            </Button>
          )}
          <Button variant="outlined" color="error" startIcon={<BlockRoundedIcon />} onClick={onRetire} disabled={busy} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
            Retire
          </Button>
        </Box>
      </Box>

      {row.status === 'draft' && errors.length > 0 && (
        <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Failed {errors.length === 1 ? 'one check' : `${errors.length} checks`}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {errors.map((e, i) => (
              <li key={i}>
                <Typography variant="body2">{e}</Typography>
              </li>
            ))}
          </Box>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Notes: {warnings.join('; ')}
        </Typography>
      )}

      <Button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={previewId}
        endIcon={<ExpandMoreRoundedIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
        sx={{ mt: 1, minHeight: 44, textTransform: 'none', fontWeight: 700, px: 1, ml: -1 }}
      >
        {open ? 'Hide the lesson' : 'Preview the lesson'}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Box id={previewId} sx={{ mt: 1, display: 'grid', gap: 2 }}>
          <PackPreview pack={pack} />
        </Box>
      </Collapse>
    </Paper>
  );
}

function PackPreview({ pack }: { pack: Partial<TutorPack> | null }) {
  if (!pack || typeof pack !== 'object') {
    return <Typography color="text.secondary">This pack has no readable content.</Typography>;
  }
  const steps = Array.isArray(pack.steps) ? pack.steps : [];
  const hints = Array.isArray(pack.hints) ? pack.hints : [];
  return (
    <>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
          Steps
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 1.5 }}>
          {steps.map((s) => (
            <li key={s.id}>
              <MathText text={s.teach || ''} variant="body2" />
              <MathText text={`Check: ${s.ask || ''}`} variant="body2" sx={{ fontWeight: 600, mt: 0.5 }} />
              {s.answer_kind === 'choice' ? (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {(s.choices || []).map((c) => (
                    <li key={c.id}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <MathText text={c.md} variant="body2" component="span" />
                        {c.correct && <Chip size="small" color="success" label="Correct" />}
                        {c.mistake && <Chip size="small" variant="outlined" label={c.mistake} />}
                      </Box>
                    </li>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Expects {s.expected ?? 'a number'}
                  {s.tolerance ? ` (within ${s.tolerance})` : ''}
                </Typography>
              )}
            </li>
          ))}
        </Box>
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
          Hints
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.75 }}>
          {hints.map((h, i) => (
            <li key={i}>
              <MathText text={h} variant="body2" />
            </li>
          ))}
        </Box>
      </Box>
      {pack.final && (
        <Box>
          <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
            Final answer
          </Typography>
          <MathText text={pack.final.md || ''} variant="body2" />
          <Typography variant="caption" color="text.secondary">
            Key: {pack.final.option_id ?? pack.final.value ?? 'not set'}
          </Typography>
        </Box>
      )}
    </>
  );
}
