'use client';

/**
 * Review requests: one link per past student, and where each one has got to.
 *
 * Staff prefill what we already know (photo, exam, year, AIR or percentile,
 * college, centre), copy the link into WhatsApp, and watch it move from Sent to
 * Submitted to Published to Posted on Google. The review itself is edited and
 * published in Testimonials, which is where every learner review is moderated.
 *
 * Desktop-first like the rest of Admin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  ImageUploadField,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  UserAvatar,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import BlockIcon from '@mui/icons-material/Block';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import {
  REVIEW_PROGRESS_LABELS,
  type ReviewRequestListRow,
  type ReviewRequestProgress,
} from '@neram/database';
import { StatusChip, a11yRootSx } from '@/components/user360/shared';
import { buildWhatsAppLink, copyToClipboard } from '@/lib/whatsapp-templates/whatsapp';
import { formatDate } from '@/lib/user360-view';
import { PROGRESS_ORDER, googleLinkWarning, resultLine } from '@/lib/review-requests-view';
import type { ReviewPersonCandidate } from '@/app/api/review-requests/people/route';
import BatchLinksDialog from '@/components/review-requests/BatchLinksDialog';

type Row = ReviewRequestListRow & {
  url: string;
  message: string;
  google_centre: string | null;
  reminder: { platform: 'google' | 'justdial' | 'sulekha'; message: string } | null;
};

const REMIND_LABEL = { google: 'Google', justdial: 'Justdial', sulekha: 'Sulekha' } as const;

interface Centre {
  id: string;
  name: string;
  city: string | null;
  center_type: string | null;
  has_google: boolean;
}

interface CreatedLink {
  id: string;
  student_name: string;
  reused: boolean;
  url: string;
  message: string;
  phone: string | null;
}

const TONE: Record<ReviewRequestProgress, 'neutral' | 'info' | 'warning' | 'success'> = {
  not_sent: 'neutral',
  sent: 'info',
  opened: 'info',
  submitted: 'warning',
  published: 'success',
  posted_google: 'success',
  expired: 'neutral',
  cancelled: 'neutral',
};

const EXAM_OPTIONS = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'NATA and JEE Paper 2' },
];

const MODE_OPTIONS = [
  { value: 'offline', label: 'Classroom' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online', label: 'Online' },
];

const btnSx = { textTransform: 'none', fontWeight: 600, minHeight: 44 } as const;

/** wa.me needs the country code; Indian numbers are often stored without it. */
function waPhone(phone: string | null | undefined): string | undefined {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return undefined;
  return d.length === 10 ? `91${d}` : d;
}

function lastActivity(r: Row): string {
  const stamps = [
    r.google_posted_self_reported_at,
    r.submitted_at,
    r.opened_at,
    r.sent_at,
    r.created_at,
  ].filter(Boolean) as string[];
  return stamps.length ? formatDate(stamps[0]) : '';
}

export default function ReviewRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ReviewRequestProgress | 'all'>('all');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [created, setCreated] = useState<CreatedLink[] | null>(null);
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/review-requests', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load review requests.');
      setRows(body.requests || []);
      setCentres(body.centres || []);
    } catch (e: any) {
      setError(e.message || 'Could not load review requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Partial<Record<ReviewRequestProgress, number>> = {};
    for (const r of rows) c[r.progress] = (c[r.progress] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === 'all' || r.progress === filter) &&
        (!q || r.student_name.toLowerCase().includes(q) || (r.college_admitted || '').toLowerCase().includes(q)),
    );
  }, [rows, filter, search]);

  const centresWithoutGoogle = centres.filter((c) => !c.has_google).length;

  const markSent = useCallback(async (id: string) => {
    await fetch(`/api/review-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_sent' }),
    }).catch(() => {});
  }, []);

  const copyLink = useCallback(
    async (r: { id: string; message: string }, what: 'message' | 'link', url?: string) => {
      const ok = await copyToClipboard(what === 'message' ? r.message : url || r.message);
      setToast(ok ? (what === 'message' ? 'Message and link copied' : 'Link copied') : 'Could not copy');
      if (ok) {
        await markSent(r.id);
        void load();
      }
    },
    [load, markSent],
  );

  const sendWhatsApp = useCallback(
    async (r: { id: string; message: string; phone: string | null }) => {
      window.open(buildWhatsAppLink(r.message, waPhone(r.phone)), '_blank', 'noopener,noreferrer');
      await markSent(r.id);
      void load();
    },
    [load, markSent],
  );

  /** The one follow-up: opens WhatsApp with the reminder, then records it so it is not sent twice. */
  const remind = useCallback(
    async (r: Row) => {
      if (!r.reminder) return;
      window.open(buildWhatsAppLink(r.reminder.message, waPhone(r.phone)), '_blank', 'noopener,noreferrer');
      await fetch(`/api/review-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_reminded' }),
      }).catch(() => {});
      setToast(`Reminder about ${REMIND_LABEL[r.reminder.platform]} opened in WhatsApp`);
      void load();
    },
    [load],
  );

  const act = useCallback(
    async (r: Row, action: 'cancel' | 'regenerate') => {
      setBusyId(r.id);
      try {
        const res = await fetch(`/api/review-requests/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not update.');
        if (action === 'regenerate') {
          setCreated([{ id: body.id, student_name: r.student_name, reused: false, url: body.url, message: body.message, phone: r.phone }]);
        } else {
          setToast('Link cancelled. It no longer opens.');
        }
        await load();
      } catch (e: any) {
        setToast(e.message || 'Could not update.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <Box sx={{ ...a11yRootSx, minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ minWidth: 0, maxWidth: 760 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Review requests
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Send a past student one link. They rate us and speak or type a review, and it lands in Testimonials for you to
            edit and publish. Then they are asked to post it on their centre&apos;s Google page.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PlaylistAddIcon />} onClick={() => setBatchOpen(true)} sx={btnSx}>
            Add a batch
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDrawerOpen(true)} sx={{ ...btnSx, boxShadow: 'none' }}>
            New review link
          </Button>
        </Stack>
      </Box>

      {centresWithoutGoogle > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button component={Link} href="/centres" sx={btnSx}>Open Centres</Button>}>
          {centresWithoutGoogle} of {centres.length} centres have no Google Place ID, so their students will not see the
          &quot;Post on Google&quot; step. Add the Place ID in Centres.
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }} role="group" aria-label="Filter by status">
        <Chip
          label={`All (${rows.length})`}
          clickable
          color={filter === 'all' ? 'primary' : 'default'}
          variant={filter === 'all' ? 'filled' : 'outlined'}
          onClick={() => setFilter('all')}
          aria-pressed={filter === 'all'}
          sx={{ minHeight: 36, fontWeight: 600 }}
        />
        {PROGRESS_ORDER.filter((p) => counts[p]).map((p) => (
          <Chip
            key={p}
            label={`${REVIEW_PROGRESS_LABELS[p]} (${counts[p]})`}
            clickable
            color={filter === p ? 'primary' : 'default'}
            variant={filter === p ? 'filled' : 'outlined'}
            onClick={() => setFilter(p)}
            aria-pressed={filter === p}
            sx={{ minHeight: 36, fontWeight: 600 }}
          />
        ))}
        <TextField
          size="small"
          placeholder="Search name or college"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputProps={{ 'aria-label': 'Search name or college' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Clear search" onClick={() => setSearch('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
          sx={{ ml: { md: 'auto' }, minWidth: 260 }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load} sx={btnSx}>Try again</Button>}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
        <Table size="small" aria-label="Review requests">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50', whiteSpace: 'nowrap' } }}>
              <TableCell>Student</TableCell>
              <TableCell>Result</TableCell>
              <TableCell>Google page</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last activity</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center' }}>
                  <RateReviewOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} aria-hidden />
                  <Typography sx={{ fontWeight: 600, mt: 1 }}>
                    {rows.length ? 'Nothing matches this filter.' : 'No review links yet.'}
                  </Typography>
                  {!rows.length && (
                    <Button startIcon={<AddIcon />} onClick={() => setDrawerOpen(true)} sx={{ ...btnSx, mt: 1 }}>
                      Make the first one
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              visible.map((r) => {
                const live = r.progress !== 'cancelled' && r.progress !== 'expired';
                const warning = googleLinkWarning({ learningMode: r.learning_mode, centreName: r.centre_name, hasTarget: Boolean(r.google_centre) });
                return (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 200 }}>
                        <UserAvatar name={r.student_name} src={r.photo_url} size={36} clickable={false} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }}>{r.student_name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {EXAM_OPTIONS.find((e) => e.value === r.exam_type)?.label}
                            {r.exam_year ? ` ${r.exam_year}` : ''}
                            {r.learning_mode ? ` · ${MODE_OPTIONS.find((m) => m.value === r.learning_mode)?.label}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="body2">{resultLine(r) || <Box component="span" sx={{ color: 'text.disabled' }}>Not added</Box>}</Typography>
                      {r.testimonial?.rating ? (
                        <Typography variant="body2" color={r.testimonial.rating <= 3 ? 'warning.dark' : 'text.secondary'}>
                          Rated {r.testimonial.rating} of 5
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {warning ? (
                        <Tooltip title={warning}>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'warning.dark' }} tabIndex={0} aria-label={warning}>
                            <WarningAmberOutlinedIcon fontSize="small" aria-hidden />
                            <Typography variant="body2">None</Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2">{r.google_centre}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip icon={<RateReviewOutlinedIcon />} label={REVIEW_PROGRESS_LABELS[r.progress]} tone={TONE[r.progress]} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" color="text.secondary">
                        {lastActivity(r)}
                      </Typography>
                      {r.google_review_matched_at && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'success.dark', fontWeight: 600 }}>
                          Found on Google {formatDate(r.google_review_matched_at)}
                        </Typography>
                      )}
                      {r.reminder_sent_at && (
                        <Typography variant="caption" color="text.secondary">
                          Reminded {formatDate(r.reminder_sent_at)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {live && (
                        <>
                          <Tooltip title="Copy message with link">
                            <IconButton aria-label={`Copy message for ${r.student_name}`} onClick={() => copyLink(r, 'message')}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={r.phone ? 'Send on WhatsApp' : 'Open WhatsApp (no phone saved)'}>
                            <IconButton aria-label={`Send ${r.student_name} the link on WhatsApp`} onClick={() => sendWhatsApp(r)} sx={{ color: '#128C7E' }}>
                              <WhatsAppIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {r.reminder && (
                        <Tooltip title={`Remind them to post on ${REMIND_LABEL[r.reminder.platform]} (once)`}>
                          <IconButton aria-label={`Remind ${r.student_name} to post on ${REMIND_LABEL[r.reminder.platform]}`} onClick={() => remind(r)} sx={{ color: 'warning.dark' }}>
                            <NotificationsActiveOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {r.testimonial_id && (
                        <Tooltip title="Open the review in Testimonials">
                          <IconButton component={Link} href="/testimonials?view=waiting&source=learner" aria-label={`Open ${r.student_name}'s review`}>
                            <RateReviewOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {live && !r.submitted_at && (
                        <>
                          <Tooltip title="New link (the old one stops working)">
                            <span>
                              <IconButton aria-label={`New link for ${r.student_name}`} onClick={() => act(r, 'regenerate')} disabled={busyId === r.id}>
                                <RefreshIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Cancel this link">
                            <span>
                              <IconButton aria-label={`Cancel ${r.student_name}'s link`} onClick={() => act(r, 'cancel')} disabled={busyId === r.id}>
                                <BlockIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>

      <NewRequestDrawer
        open={drawerOpen}
        centres={centres}
        onClose={() => setDrawerOpen(false)}
        onCreated={(links) => {
          setDrawerOpen(false);
          setCreated(links);
          void load();
        }}
      />
      <BatchLinksDialog
        open={batchOpen}
        centres={centres}
        onClose={() => setBatchOpen(false)}
        onCreated={(links) => {
          setBatchOpen(false);
          setCreated(links);
          void load();
        }}
        onUseStudentResults={() => {
          setBatchOpen(false);
          setBulkOpen(true);
        }}
      />
      <BulkFromResultsDialog
        open={bulkOpen}
        centres={centres}
        onClose={() => setBulkOpen(false)}
        onCreated={(links) => {
          setBulkOpen(false);
          setCreated(links);
          void load();
        }}
      />
      <CreatedLinksDialog
        links={created}
        onClose={() => setCreated(null)}
        onCopy={(l) => copyLink(l, 'message')}
        onWhatsApp={(l) => sendWhatsApp(l)}
      />
      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}

// ── New link drawer ────────────────────────────────────────────────────────

interface FormState {
  userId: string | null;
  studentResultId: string | null;
  studentName: string;
  photoUrl: string;
  examType: string;
  examYear: string;
  airRank: string;
  percentile: string;
  collegeAdmitted: string;
  centerId: string;
  city: string;
  learningMode: string;
  phone: string;
}

const EMPTY_FORM: FormState = {
  userId: null,
  studentResultId: null,
  studentName: '',
  photoUrl: '',
  examType: 'NATA',
  examYear: String(new Date().getFullYear()),
  airRank: '',
  percentile: '',
  collegeAdmitted: '',
  centerId: '',
  city: '',
  learningMode: 'offline',
  phone: '',
};

async function uploadPhoto(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', 'photo');
  const res = await fetch('/api/admin/student-results/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Upload failed (HTTP ${res.status})`);
  }
  const { photo_url } = await res.json();
  return { url: photo_url };
}

function NewRequestDrawer({
  open,
  centres,
  onClose,
  onCreated,
}: {
  open: boolean;
  centres: Centre[];
  onClose: () => void;
  onCreated: (links: CreatedLink[]) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ReviewPersonCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setQuery('');
      setOptions([]);
      setErrors({});
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/review-requests/people?q=${encodeURIComponent(query.trim())}`);
        const body = await res.json();
        setOptions(body.people || []);
      } catch {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [query]);

  const set = (key: keyof FormState, value: string | null) => {
    setForm((f) => ({ ...f, [key]: value ?? '' }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const pick = (p: ReviewPersonCandidate | null) => {
    if (!p) return;
    setForm((f) => ({
      ...f,
      userId: p.userId,
      studentResultId: p.studentResultId,
      studentName: p.name,
      photoUrl: p.photoUrl || '',
      examType: p.examType,
      examYear: p.examYear ? String(p.examYear) : f.examYear,
      airRank: p.airRank ? String(p.airRank) : '',
      percentile: p.percentile != null ? String(p.percentile) : '',
      collegeAdmitted: p.collegeAdmitted || '',
      city: p.city || f.city,
      phone: p.phone || '',
      centerId: f.centerId || centres.find((c) => c.city && p.city && c.city.toLowerCase() === p.city.toLowerCase())?.id || '',
    }));
  };

  const selectedCentre = centres.find((c) => c.id === form.centerId) || null;
  const headquarters = centres.find((c) => c.center_type === 'headquarters') || null;
  const hasTarget =
    form.learningMode === 'online'
      ? Boolean(headquarters?.has_google || selectedCentre?.has_google)
      : Boolean(selectedCentre?.has_google);
  const warning = googleLinkWarning({ learningMode: form.learningMode, centreName: selectedCentre?.name ?? null, hasTarget });

  const submit = async () => {
    setSaving(true);
    setError('');
    setErrors({});
    try {
      const res = await fetch('/api/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ ...form, centerId: form.centerId || null }] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.fieldErrors || {});
        throw new Error(body.error || 'Could not create the link.');
      }
      onCreated(body.created || []);
    } catch (e: any) {
      setError(e.message || 'Could not create the link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={saving ? undefined : onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 } } }}>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, minHeight: '100%' }} component="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            New review link
          </Typography>
          <IconButton aria-label="Close" onClick={onClose} disabled={saving}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Autocomplete
          options={options}
          loading={searching}
          filterOptions={(x) => x}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.key === b.key}
          onInputChange={(_, v, reason) => reason === 'input' && setQuery(v)}
          onChange={(_, v) => pick(v)}
          noOptionsText={query.trim().length < 2 ? 'Type at least two letters' : 'No one found. Fill the details below by hand.'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.key} sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
              <UserAvatar name={o.name} src={o.photoUrl} size={32} clickable={false} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>{o.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {[o.label, resultLine({ air_rank: o.airRank, percentile: o.percentile, college_admitted: o.collegeAdmitted })].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Find the student (optional)"
              helperText="Searches students, alumni and Student Results, and fills in what we know."
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {searching ? <CircularProgress size={18} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />

        <Divider />

        <ImageUploadField label="Student photo" value={form.photoUrl || null} onChange={(url) => set('photoUrl', url || '')} upload={uploadPhoto} maxSizeMB={5} />

        <TextField label="Student name" value={form.studentName} onChange={(e) => set('studentName', e.target.value)} required error={Boolean(errors.studentName)} helperText={errors.studentName || ' '} />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField select label="Exam" value={form.examType} onChange={(e) => set('examType', e.target.value)} error={Boolean(errors.examType)}>
            {EXAM_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Exam year" value={form.examYear} onChange={(e) => set('examYear', e.target.value.replace(/\D/g, '').slice(0, 4))} inputProps={{ inputMode: 'numeric' }} error={Boolean(errors.examYear)} helperText={errors.examYear} />
          <TextField label="All India Rank" value={form.airRank} onChange={(e) => set('airRank', e.target.value.replace(/\D/g, ''))} inputProps={{ inputMode: 'numeric' }} error={Boolean(errors.airRank)} helperText={errors.airRank || 'Optional'} />
          <TextField label="Percentile" value={form.percentile} onChange={(e) => set('percentile', e.target.value.replace(/[^\d.]/g, ''))} inputProps={{ inputMode: 'decimal' }} error={Boolean(errors.percentile)} helperText={errors.percentile || 'Optional, for JEE'} />
        </Box>

        <TextField label="College they joined" value={form.collegeAdmitted} onChange={(e) => set('collegeAdmitted', e.target.value)} helperText="Optional. Shown on the review card." />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField select label="How they studied" value={form.learningMode} onChange={(e) => set('learningMode', e.target.value)}>
            {MODE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Centre" value={form.centerId} onChange={(e) => set('centerId', e.target.value)}>
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {centres.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
                {!c.has_google ? ' (no Google link)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {warning && (
          <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
            {warning}
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <TextField label="WhatsApp number" value={form.phone} onChange={(e) => set('phone', e.target.value)} inputProps={{ inputMode: 'tel' }} error={Boolean(errors.phone)} helperText={errors.phone || 'Optional, opens their chat'} />
        </Box>

        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 'auto', display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 1 }}>
          <Button onClick={onClose} disabled={saving} sx={btnSx}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving || form.studentName.trim().length < 2} sx={{ ...btnSx, boxShadow: 'none' }}>
            {saving ? 'Creating...' : 'Create link'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}

// ── Bulk from Student Results ──────────────────────────────────────────────

interface ResultRow {
  id: string;
  user_id: string | null;
  student_name: string;
  photo_url: string | null;
  exam_type: string;
  exam_year: number | null;
  rank: number | null;
  percentile: number | null;
  score: number | null;
  college_name: string | null;
}

function BulkFromResultsDialog({
  open,
  centres,
  onClose,
  onCreated,
}: {
  open: boolean;
  centres: Centre[];
  onClose: () => void;
  onCreated: (links: CreatedLink[]) => void;
}) {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [centerId, setCenterId] = useState('');
  const [mode, setMode] = useState('offline');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setError('');
    setLoading(true);
    fetch('/api/admin/student-results?limit=200')
      .then((r) => r.json())
      .then((b) => setResults(b.data || []))
      .catch(() => setError('Could not load Student Results.'))
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const create = async () => {
    setSaving(true);
    setError('');
    try {
      const items = results
        .filter((r) => picked.has(r.id))
        .map((r) => ({
          userId: r.user_id,
          studentResultId: r.id,
          studentName: r.student_name,
          photoUrl: r.photo_url,
          examType: r.exam_type === 'jee_paper2' ? 'JEE_PAPER_2' : 'NATA',
          examYear: r.exam_year,
          airRank: r.rank,
          percentile: r.percentile,
          score: r.score,
          collegeAdmitted: r.college_name,
          centerId: centerId || null,
          learningMode: mode,
        }));
      const res = await fetch('/api/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not create the links.');
      onCreated(body.created || []);
    } catch (e: any) {
      setError(e.message || 'Could not create the links.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="bulk-title">
      <DialogTitle id="bulk-title">Review links from Student Results</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <TextField select label="Centre for everyone picked" value={centerId} onChange={(e) => setCenterId(e.target.value)} helperText="You can change one later.">
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {centres.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
                {!c.has_google ? ' (no Google link)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="How they studied" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {loading ? (
          <Stack spacing={1}>
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </Stack>
        ) : results.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Student Results is empty. Add results there, or use New review link for one student at a time.
          </Typography>
        ) : (
          <Table size="small" aria-label="Student results">
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id} hover onClick={() => toggle(r.id)} sx={{ cursor: 'pointer' }}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={picked.has(r.id)} inputProps={{ 'aria-label': `Pick ${r.student_name}` }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{r.student_name}</Typography>
                  </TableCell>
                  <TableCell>
                    {r.exam_type.toUpperCase()} {r.exam_year || ''}
                  </TableCell>
                  <TableCell>{resultLine({ air_rank: r.rank, percentile: r.percentile, college_admitted: r.college_name })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={btnSx}>
          Cancel
        </Button>
        <Button variant="contained" onClick={create} disabled={saving || picked.size === 0} sx={{ ...btnSx, boxShadow: 'none' }}>
          {saving ? 'Creating...' : `Create ${picked.size || ''} link${picked.size === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Links just made ────────────────────────────────────────────────────────

function CreatedLinksDialog({
  links,
  onClose,
  onCopy,
  onWhatsApp,
}: {
  links: CreatedLink[] | null;
  onClose: () => void;
  onCopy: (l: CreatedLink) => void;
  onWhatsApp: (l: CreatedLink) => void;
}) {
  return (
    <Dialog open={Boolean(links)} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="created-title">
      <DialogTitle id="created-title">{links && links.length > 1 ? `${links.length} links ready` : 'Link ready'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {(links || []).map((l) => (
            <Box key={l.id}>
              <Typography sx={{ fontWeight: 600 }}>
                {l.student_name}
                {l.reused && (
                  <Typography component="span" variant="body2" color="text.secondary">
                    {' '}
                    (already had a live link, this is the same one)
                  </Typography>
                )}
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all', color: 'text.secondary', my: 0.5 }}>
                {l.url}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button startIcon={<ContentCopyIcon />} onClick={() => onCopy(l)} sx={btnSx}>
                  Copy message
                </Button>
                <Button startIcon={<WhatsAppIcon />} onClick={() => onWhatsApp(l)} sx={{ ...btnSx, color: '#128C7E' }}>
                  WhatsApp
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" sx={{ ...btnSx, boxShadow: 'none' }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
