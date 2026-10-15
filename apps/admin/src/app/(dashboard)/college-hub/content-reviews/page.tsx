'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import RateReviewIcon from '@mui/icons-material/RateReview';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlaceIcon from '@mui/icons-material/Place';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useMicrosoftAuth } from '@neram/auth';
import { HubPageHeader, formatDateTime } from '@/components/college-hub/hub-ui';
import type { DiffRow } from '@/lib/college-content-submissions/apply';
import { googleMapsUrl } from '@/lib/college-map-pins/geo';
import { phoneForCall } from '@/lib/college-update-links/helpers';

interface Submission {
  id: string;
  college_id: string;
  section: string;
  section_label: string;
  payload: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  submitted_by_name: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  /** Absent before the update links migration: treat as 'dashboard'. */
  source?: 'dashboard' | 'link' | null;
  submitter_role?: string | null;
  submitter_phone?: string | null;
  update_link_id?: string | null;
  college: { id: string; name: string; slug: string | null; state_slug: string | null; city: string | null } | null;
  diff: DiffRow[];
}

type TabKey = 'pending' | 'recent';

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function Thumb({ url, alt }: { url: string; alt: string }) {
  return (
    <MuiLink href={url} target="_blank" rel="noopener noreferrer" aria-label={`${alt} (opens in a new tab)`}>
      <Box
        component="img"
        src={url}
        alt={alt}
        loading="lazy"
        sx={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider', display: 'block' }}
      />
    </MuiLink>
  );
}

function Value({ row, side }: { row: DiffRow; side: 'before' | 'after' }) {
  const v = side === 'before' ? row.before : row.after;
  if (isEmpty(v)) {
    return (
      <Typography variant="body2" color="text.secondary" fontStyle="italic">
        Empty
      </Typography>
    );
  }
  if (row.kind === 'image' && typeof v === 'string') return <Thumb url={v} alt={`${row.label} ${side}`} />;
  if (row.kind === 'images' && Array.isArray(v)) {
    return (
      <Stack direction="row" gap={1} flexWrap="wrap">
        {v.map((u, i) => (
          <Thumb key={`${u}-${i}`} url={String(u)} alt={`${row.label} photo ${i + 1} ${side}`} />
        ))}
      </Stack>
    );
  }
  if (row.kind === 'bool') return <Typography variant="body2">{v ? 'Yes' : 'No'}</Typography>;
  if (Array.isArray(v)) return <Typography variant="body2">{v.join(', ')}</Typography>;
  if ((row.kind === 'number' || row.kind === 'integer') && typeof v === 'number') {
    return <Typography variant="body2">{v.toLocaleString('en-IN')}</Typography>;
  }
  if (row.kind === 'url' && typeof v === 'string') {
    return (
      <MuiLink href={v} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ wordBreak: 'break-all' }}>
        {v}
      </MuiLink>
    );
  }
  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {String(v)}
    </Typography>
  );
}

function LocationLinks({ s }: { s: Submission }) {
  const lat = s.payload.latitude;
  const lng = s.payload.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const prevLat = s.previous?.latitude;
  const prevLng = s.previous?.longitude;
  return (
    <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mt: 1.5 }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PlaceIcon />}
        endIcon={<OpenInNewIcon fontSize="small" />}
        href={googleMapsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ minHeight: 40 }}
      >
        Open new pin in Google Maps ({lat}, {lng})
      </Button>
      {typeof prevLat === 'number' && typeof prevLng === 'number' && (
        <Button
          size="small"
          endIcon={<OpenInNewIcon fontSize="small" />}
          href={googleMapsUrl(prevLat, prevLng)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ minHeight: 40 }}
        >
          Current pin
        </Button>
      )}
    </Stack>
  );
}

function SubmissionCard({ s, onDecide }: { s: Submission; onDecide: (s: Submission, d: 'approve' | 'reject') => void }) {
  const changed = s.diff.filter((d) => d.changed).length;
  const publicUrl = s.college?.slug && s.college.state_slug ? `/colleges/${s.college.state_slug}/${s.college.slug}` : null;
  const fromLink = s.source === 'link';
  const call = fromLink ? phoneForCall(s.submitter_phone) : null;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5} sx={{ mb: 1.5 }}>
        <Box>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="subtitle1" component="h2" fontWeight={700}>
              {s.college?.name ?? 'Unknown college'}
            </Typography>
            <Chip size="small" label={s.section_label} color="primary" variant="outlined" />
            {s.status !== 'pending' && (
              <Chip size="small" label={s.status === 'approved' ? 'Approved' : s.status === 'rejected' ? 'Rejected' : s.status} color={s.status === 'approved' ? 'success' : 'default'} />
            )}
          </Stack>
          {fromLink ? (
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
              <WhatsAppIcon fontSize="small" color="success" aria-hidden />
              <Typography variant="body2" fontWeight={600}>
                From a WhatsApp link: {[s.submitted_by_name || 'Name not given', s.submitter_role].filter(Boolean).join(', ')}
              </Typography>
              {call && (
                <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={call.href} sx={{ minHeight: 36 }}>
                  Call {call.display}
                </Button>
              )}
            </Stack>
          ) : null}
          <Typography variant="caption" color="text.secondary" component="div">
            {fromLink ? 'Sent' : `Sent by ${s.submitted_by_name || 'the college'}`} on {formatDateTime(s.submitted_at)}. {changed} of{' '}
            {s.diff.length} field
            {s.diff.length === 1 ? '' : 's'} changed.
          </Typography>
          {s.status !== 'pending' && (
            <Typography variant="caption" color="text.secondary" component="div">
              {s.status === 'approved' ? 'Approved' : 'Rejected'} by {s.reviewed_by || 'staff'} on {formatDateTime(s.reviewed_at)}
              {s.review_note ? `: ${s.review_note}` : ''}
            </Typography>
          )}
        </Box>
        {publicUrl && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: { md: 'center' } }}>
            Public page: {publicUrl}
          </Typography>
        )}
      </Stack>

      <TableContainer sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 200 }}>Field</TableCell>
              <TableCell>Before</TableCell>
              <TableCell>After</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {s.diff.map((d) => (
              <TableRow key={d.key} sx={d.changed ? { '& td': { bgcolor: 'rgba(237, 108, 2, 0.06)' } } : undefined}>
                <TableCell>
                  <Typography variant="body2" fontWeight={d.changed ? 700 : 400}>
                    {d.label}
                  </Typography>
                  {d.changed && (
                    <Typography variant="caption" color="warning.dark">
                      Changed
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                  <Value row={d} side="before" />
                </TableCell>
                <TableCell>
                  <Value row={d} side="after" />
                </TableCell>
              </TableRow>
            ))}
            {s.diff.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="body2" color="text.secondary">
                    No known fields in this submission.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {s.section === 'location' && <LocationLinks s={s} />}

      {s.status === 'pending' && (
        <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button variant="outlined" color="inherit" startIcon={<CancelIcon />} onClick={() => onDecide(s, 'reject')} sx={{ minHeight: 44 }}>
            Reject
          </Button>
          <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => onDecide(s, 'approve')} sx={{ minHeight: 44 }}>
            Approve and publish
          </Button>
        </Stack>
      )}
    </Paper>
  );
}

export default function ContentReviewsPage() {
  const { user } = useMicrosoftAuth();
  const [tab, setTab] = useState<TabKey>('pending');
  const [rows, setRows] = useState<Submission[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [deciding, setDeciding] = useState<{ s: Submission; decision: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/college-hub/content-reviews?tab=${tab}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load submissions');
      setRows(j.data ?? []);
      setPendingCount(j.pending_count ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (s: Submission, decision: 'approve' | 'reject') => {
    setDeciding({ s, decision });
    setNote('');
    setDialogError('');
  };

  const submit = async () => {
    if (!deciding) return;
    if (deciding.decision === 'reject' && !note.trim()) return setDialogError('Add a short note so the college knows what to fix.');
    setSaving(true);
    setDialogError('');
    try {
      const res = await fetch(`/api/college-hub/content-reviews/${deciding.s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: deciding.decision, note, staff_name: user?.name || user?.email, staff_email: user?.email }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save');
      setToast(
        deciding.decision === 'approve'
          ? `${deciding.s.section_label} for ${deciding.s.college?.name ?? 'the college'} is live.`
          : deciding.s.source === 'link'
            ? `Rejected. Nothing changed for ${deciding.s.college?.name ?? 'the college'}.`
            : `Sent back to ${deciding.s.college?.name ?? 'the college'} with your note.`,
      );
      setDeciding(null);
      load();
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <HubPageHeader
        icon={<RateReviewIcon />}
        title="Content reviews"
        description="Changes colleges make in their dashboard, or send through a WhatsApp update link, wait here. Approving publishes them on the public college page and marks that section as provided by the college. Rejecting sends your note back to the college."
      />

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Submission lists">
          <Tab value="pending" label={pendingCount === null ? 'Waiting' : `Waiting (${pendingCount})`} sx={{ minHeight: 48 }} />
          <Tab value="recent" label="Recently decided" sx={{ minHeight: 48 }} />
        </Tabs>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {loading && (
        <Stack gap={2}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" height={220} />
          ))}
        </Stack>
      )}

      {!loading && !error && rows.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {tab === 'pending' ? 'Nothing waiting. New college edits show up here.' : 'Nothing decided yet.'}
          </Typography>
        </Paper>
      )}

      <Stack gap={2}>{!loading && rows.map((s) => <SubmissionCard key={s.id} s={s} onDecide={open} />)}</Stack>

      <Dialog open={Boolean(deciding)} onClose={() => !saving && setDeciding(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {deciding?.decision === 'approve' ? 'Approve and publish' : 'Reject'} {deciding?.s.section_label.toLowerCase()} for{' '}
          {deciding?.s.college?.name}
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            {deciding?.decision === 'approve' ? (
              <Alert severity="info">The changes go live on the public college page within a minute.</Alert>
            ) : (
              <Alert severity="warning">
                {deciding?.s.source === 'link'
                  ? 'Nothing changes on the public page. This came from a WhatsApp link, so the note is kept for the record. Call or message them if you need a correction.'
                  : 'Nothing changes on the public page. The college sees your note and can send it again.'}
              </Alert>
            )}
            <TextField
              label={deciding?.decision === 'reject' ? 'Note to the college' : 'Note (optional)'}
              required={deciding?.decision === 'reject'}
              multiline
              minRows={2}
              size="small"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText={deciding?.decision === 'reject' ? 'For example: the fee looks like a total for 5 years, please enter it per year.' : undefined}
              autoFocus={deciding?.decision === 'reject'}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeciding(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={deciding?.decision === 'approve' ? 'success' : 'error'}
            onClick={submit}
            disabled={saving || (deciding?.decision === 'reject' && !note.trim())}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {saving ? 'Saving...' : deciding?.decision === 'approve' ? 'Approve and publish' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
