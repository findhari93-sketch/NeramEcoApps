'use client';

/**
 * Testimonials: the moderation queue and the library in one flat page
 * (lifecycle plan M6).
 *
 * Tabs by where a testimonial stands (Waiting for review, Public, Not public,
 * All) and a source filter (learners or staff entered). Nothing a learner
 * writes goes public without their consent (or a guardian's) and a staff
 * Publish. Staff testimonials keep the existing Add and Edit pages.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
  Skeleton,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import ModerationCard, { type ModerationTestimonial } from '@/components/testimonials/ModerationCard';
import { a11yRootSx } from '@/components/user360/shared';
import {
  ACTION_LABELS,
  API_ACTION,
  MODERATION_TABS,
  needsConfirmation,
  MODERATION_TAB_LABELS,
  apiStatusForTab,
  resolveModerationTab,
  resolveSourceFilter,
  rowMatchesTab,
  testimonialText,
  type ModerationActionKey,
  type ModerationTab,
  type SourceFilter,
} from '@/lib/testimonial-moderation';

const EMPTY_TEXT: Record<ModerationTab, string> = {
  waiting: 'Nothing is waiting for review. New learner testimonials land here.',
  confirm: 'Every public testimonial has been confirmed by a staff member.',
  public: 'No testimonial is public yet.',
  not_public: 'No private, approved, rejected or taken-down testimonials.',
  all: 'No testimonials yet.',
};

const SUCCESS_TEXT: Record<ModerationActionKey, string> = {
  approve: 'Approved. It stays private until someone publishes it.',
  publish: 'Published. It now shows on the website.',
  reject: 'Marked as not published.',
  withdraw: 'Taken down from the website.',
  confirm: 'Confirmed as genuine. It now counts on the reviews page and in the rating.',
};

export default function TestimonialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = resolveModerationTab(searchParams.get('view'));
  const source = resolveSourceFilter(searchParams.get('source'));

  const [rows, setRows] = useState<ModerationTestimonial[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [toConfirm, setToConfirm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [reasonFor, setReasonFor] = useState<{ t: ModerationTestimonial; action: 'reject' | 'withdraw' } | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const setQuery = (next: { view?: ModerationTab; source?: SourceFilter }) => {
    const params = new URLSearchParams();
    const v = next.view ?? tab;
    const s = next.source ?? source;
    if (v !== 'waiting') params.set('view', v);
    if (s !== 'all') params.set('source', s);
    const qs = params.toString();
    router.replace(`/testimonials${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ status: apiStatusForTab(tab), source });
      const readsPublished = apiStatusForTab(tab) === 'published' && source === 'all';
      // The Needs confirmation count covers every source, so it needs the published list.
      const [res, publishedRes] = await Promise.all([
        fetch(`/api/testimonials/moderation?${qs.toString()}`),
        readsPublished ? Promise.resolve(null) : fetch('/api/testimonials/moderation?status=published&source=all'),
      ]);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load testimonials.');
      const list: ModerationTestimonial[] = json.testimonials || [];
      setRows(list.filter((r) => rowMatchesTab(r.publication_status, tab, r.moderated_at)));
      setPending(typeof json.pending === 'number' ? json.pending : null);
      let published: ModerationTestimonial[] | null = readsPublished ? list : null;
      if (publishedRes && publishedRes.ok) {
        const pj = await publishedRes.json().catch(() => ({}));
        published = pj.testimonials || [];
      }
      setToConfirm(published ? published.filter(needsConfirmation).length : null);
    } catch (e: any) {
      setError(e.message || 'Could not load testimonials.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, source]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.student_name, r.city, r.consent_display_name, testimonialText(r.content)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const moderate = async (t: ModerationTestimonial, action: ModerationActionKey, note?: string) => {
    setBusyId(t.id);
    setError('');
    try {
      const res = await fetch(`/api/testimonials/${t.id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: API_ACTION[action], note: note?.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update the testimonial.');
      setToast(SUCCESS_TEXT[action]);
      setReasonFor(null);
      setReason('');
      await load();
    } catch (e: any) {
      if (reasonFor) setReasonError(e.message);
      else setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const onAction = (t: ModerationTestimonial, action: ModerationActionKey) => {
    if (action === 'reject' || action === 'withdraw') {
      setReason('');
      setReasonError('');
      setReasonFor({ t, action });
      return;
    }
    moderate(t, action);
  };

  const confirmReason = () => {
    if (!reasonFor) return;
    if (reasonFor.action === 'reject' && !reason.trim()) {
      setReasonError('Add a short reason. It is kept with the testimonial for other staff.');
      return;
    }
    moderate(reasonFor.t, reasonFor.action, reason);
  };

  return (
    <Box sx={{ ...a11yRootSx, minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Testimonials
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Review what learners send, decide what goes on the website, and manage staff entered testimonials.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/testimonials/create')}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, boxShadow: 'none' }}
        >
          Add testimonial
        </Button>
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v) => setQuery({ view: v })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Testimonial status"
        sx={{
          borderBottom: '1px solid',
          borderColor: 'grey.200',
          mb: 2,
          '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600, fontSize: 14 },
        }}
      >
        {MODERATION_TABS.map((t) => (
          <Tab
            key={t}
            value={t}
            id={`mod-tab-${t}`}
            aria-controls="mod-panel"
            label={
              t === 'waiting' && pending !== null
                ? `${MODERATION_TAB_LABELS[t]} (${pending})`
                : t === 'confirm' && toConfirm !== null
                  ? `${MODERATION_TAB_LABELS[t]} (${toConfirm})`
                  : MODERATION_TAB_LABELS[t]
            }
          />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={source}
          exclusive
          onChange={(_e, v) => v && setQuery({ source: v })}
          aria-label="Who wrote it"
          size="small"
          sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { minHeight: 44, textTransform: 'none', px: 1.5, gap: 0.75 } }}
        >
          <ToggleButton value="all" aria-label="All sources">
            <AllInclusiveIcon fontSize="small" aria-hidden /> All sources
          </ToggleButton>
          <ToggleButton value="learner" aria-label="Learners">
            <SchoolOutlinedIcon fontSize="small" aria-hidden /> Learners
          </ToggleButton>
          <ToggleButton value="staff" aria-label="Staff entered">
            <BadgeOutlinedIcon fontSize="small" aria-hidden /> Staff entered
          </ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="Search name, city or text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputProps={{ 'aria-label': 'Search testimonials' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 }, maxWidth: { sm: 360 }, '& .MuiInputBase-root': { minHeight: 44 } }}
        />
      </Box>

      {error && (
        <Alert
          severity="error"
          role="alert"
          sx={{ mb: 2 }}
          onClose={() => setError('')}
          action={
            <Button color="inherit" onClick={load} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Box id="mod-panel" role="tabpanel" aria-labelledby={`mod-tab-${tab}`} aria-busy={loading}>
        {loading ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={220} />
            ))}
          </Box>
        ) : visible.length === 0 ? (
          <Paper elevation={0} sx={{ textAlign: 'center', py: 6, px: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
            <FormatQuoteIcon sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
            <Typography variant="body1" sx={{ mt: 1, fontWeight: 600 }}>
              {search.trim() ? 'No testimonial matches your search.' : EMPTY_TEXT[tab]}
            </Typography>
            {source !== 'all' && !search.trim() && (
              <Button onClick={() => setQuery({ source: 'all' })} sx={{ mt: 1, textTransform: 'none', minHeight: 44 }}>
                Show all sources
              </Button>
            )}
          </Paper>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0,1fr)', xl: 'minmax(0,1fr) minmax(0,1fr)' } }}>
            {visible.map((t) => (
              <ModerationCard key={t.id} t={t} busy={busyId === t.id} onAction={onAction} />
            ))}
          </Box>
        )}
        {!loading && rows.length >= 100 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Showing the latest 100. Use the tabs and the source filter to narrow the list.
          </Typography>
        )}
      </Box>

      <Dialog
        open={!!reasonFor}
        onClose={() => busyId === null && setReasonFor(null)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="reason-title"
      >
        <DialogTitle id="reason-title">
          {reasonFor?.action === 'reject' ? 'Not publish this testimonial?' : 'Take this testimonial down?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {reasonFor?.action === 'reject'
              ? 'It stays in the records but never shows on the website. The reason is kept for other staff.'
              : 'It will stop showing on the website right away. You can publish it again later.'}
          </Typography>
          <TextField
            label={reasonFor?.action === 'reject' ? 'Reason (required)' : 'Reason (optional)'}
            fullWidth
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError('');
            }}
            error={!!reasonError}
            helperText={reasonError || ' '}
            FormHelperTextProps={{ role: reasonError ? 'alert' : undefined }}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReasonFor(null)} disabled={busyId !== null} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmReason}
            disabled={busyId !== null}
            sx={{ textTransform: 'none', minHeight: 44, boxShadow: 'none' }}
          >
            {busyId !== null ? 'Saving...' : reasonFor ? ACTION_LABELS[reasonFor.action] : ''}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
